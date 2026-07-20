import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CargaInicialRow {
  numero: string;
  curva: string | null;
  grupo: string | null;
  pedidas: number | null;
  distribuidas: number | null;
  pendientes: number | null;
  stock_total: number | null;
  created_at: string | null;
}

const num = (v: number | null): number => Number(v) || 0;

// -----------------------------------------------------------------------
// El "numero" trae codificados la marca y la temporada, ej: CI_CQQ_VER_001
// CI = Carga Inicial (prefijo, se ignora)
// CQQ/CHK/AWA = marca | VER/INV = temporada
// -----------------------------------------------------------------------
const MARCA_CODES: Record<string, string> = {
  CQQ: "CQQTQ",
  CHK: "CHEEKY",
  AWA: "AWADA",
};
const TEMPORADA_CODES: Record<string, string> = {
  VER: "VERANO",
  INV: "INVIERNO",
};

function parseNumero(numero: string): { marca: string; temporada: string } {
  const partes = numero.split("_");
  const marcaCod = (partes[1] || "").trim().toUpperCase();
  const tempCod = (partes[2] || "").trim().toUpperCase();
  return {
    marca: MARCA_CODES[marcaCod] || marcaCod || "SIN MARCA",
    temporada: TEMPORADA_CODES[tempCod] || tempCod || "SIN TEMPORADA",
  };
}

async function fetchAllCargaInicial(): Promise<CargaInicialRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: CargaInicialRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("carga_inicial")
      .select("numero, curva, grupo, pedidas, distribuidas, pendientes, stock_total, created_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (carga_inicial): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...(data as CargaInicialRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const rows = await fetchAllCargaInicial();

    // Agregamos por (marca, curva, grupo, temporada). El "a repartir" se
    // calcula LÍNEA POR LÍNEA (min entre pendientes y stock_total) antes de
    // sumar -- no se puede calcular después sobre los totales ya sumados.
    const grupos = new Map<
      string,
      {
        marca: string;
        curva: string;
        grupo: string;
        temporada: string;
        pedidas: number;
        distribuidas: number;
        aRepartir: number;
      }
    >();

    let updatedAt: string | null = null;

    for (const r of rows) {
      const { marca, temporada } = parseNumero(r.numero);
      const curva = (r.curva || "").trim().toUpperCase() || "SIN CURVA";
      const grupoNombre = (r.grupo || "").trim() || "SIN GRUPO";
      const key = `${marca}__${curva}__${grupoNombre}__${temporada}`;

      if (!grupos.has(key)) {
        grupos.set(key, { marca, curva, grupo: grupoNombre, temporada, pedidas: 0, distribuidas: 0, aRepartir: 0 });
      }
      const acc = grupos.get(key)!;

      const pendientes = num(r.pendientes);
      const stockTotal = num(r.stock_total);

      acc.pedidas += num(r.pedidas);
      acc.distribuidas += num(r.distribuidas);
      acc.aRepartir += Math.min(pendientes, stockTotal);

      if (r.created_at && (!updatedAt || r.created_at > updatedAt)) updatedAt = r.created_at;
    }

    const filas = Array.from(grupos.values());

    return NextResponse.json({ success: true, filas, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

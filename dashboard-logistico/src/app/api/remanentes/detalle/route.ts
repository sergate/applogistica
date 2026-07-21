import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RemanenteRow {
  numero: string;
  grupo: string | null;
  pedidas: number | null;
  distribuidas: number | null;
  pendientes: number | null;
  stock_total: number | null;
  created_at: string | null;
}

const num = (v: number | null): number => Number(v) || 0;

// -----------------------------------------------------------------------
// El "numero" trae tokens sueltos separados por espacios/guiones, ej:
// "CI- 1 CQ REMA VER PRENDAS 29-05 - 1293"
// CQ/CHK/AW = marca | VER/INV = temporada | REMA = marca que el archivo
// es de remanentes (si NO aparece, la fila no cuenta para esta sección).
// -----------------------------------------------------------------------
const MARCA_CODES: Record<string, string> = {
  CQ: "CQQTQ",
  CHK: "CHEEKY",
  AW: "AWADA",
};
const TEMPORADA_CODES: Record<string, string> = {
  VER: "VERANO",
  INV: "INVIERNO",
};

function parseNumeroRemanente(numero: string): { marca: string; temporada: string; esRemanente: boolean } {
  const tokens = numero.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let marca = "SIN MARCA";
  let temporada = "SIN TEMPORADA";
  let esRemanente = false;

  for (const t of tokens) {
    if (MARCA_CODES[t]) marca = MARCA_CODES[t];
    if (TEMPORADA_CODES[t]) temporada = TEMPORADA_CODES[t];
    if (t === "REMA") esRemanente = true;
  }

  return { marca, temporada, esRemanente };
}

async function fetchAllRemanentes(): Promise<RemanenteRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: RemanenteRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("remanentes")
      .select("numero, grupo, pedidas, distribuidas, pendientes, stock_total, created_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (remanentes): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...(data as RemanenteRow[]));

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
    const rows = await fetchAllRemanentes();

    // Agregamos por (marca, numero/archivo, grupo, temporada). Solo cuentan
    // las filas cuyo "numero" indica REMA -- si un archivo distinto se
    // sube a esta tabla sin ese marcador, se ignora para los cálculos.
    const grupos = new Map<
      string,
      {
        marca: string;
        archivo: string;
        grupo: string;
        temporada: string;
        pedidas: number;
        distribuidas: number;
        aRepartir: number;
      }
    >();

    let updatedAt: string | null = null;

    for (const r of rows) {
      const { marca, temporada, esRemanente } = parseNumeroRemanente(r.numero);
      if (!esRemanente) continue;

      const grupoNombre = (r.grupo || "").trim() || "SIN GRUPO";
      const key = `${marca}__${r.numero}__${grupoNombre}__${temporada}`;

      if (!grupos.has(key)) {
        grupos.set(key, { marca, archivo: r.numero, grupo: grupoNombre, temporada, pedidas: 0, distribuidas: 0, aRepartir: 0 });
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

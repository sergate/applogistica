import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ProductividadRow {
  fecha: string;
  tipo_proceso: string | null;
  cantidad: number | null;
  created_at: string | null;
}

const num = (v: number | null): number => Number(v) || 0;

// Orden fijo en el que se muestran los tipos de proceso dentro de cada fecha.
// "INGRESO" no se muestra nunca -- se excluye antes de llegar a este orden.
const ORDEN_PROCESOS = [
  "CARGA INICIAL",
  "GUARDADO",
  "REMANENTES",
  "PICKING ECOM",
  "FINISHING ECOM",
  "PICKING REPO",
  "FINISHING REPO",
];

function mapearTipoProceso(tipo: string): string | null {
  const t = tipo.trim().toUpperCase();
  if (t === "INGRESO") return null; // se excluye por completo
  if (t === "DEVOLUCIONES" || t === "SEPARACION") return "REMANENTES";
  return t;
}

async function fetchAllProductividad(): Promise<ProductividadRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: ProductividadRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("productividad")
      .select("fecha, tipo_proceso, cantidad, created_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (productividad): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...(data as ProductividadRow[]));

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
    const rows = await fetchAllProductividad();

    const grupos = new Map<string, { fecha: string; tipoProceso: string; cantidad: number }>();
    let updatedAt: string | null = null;

    for (const r of rows) {
      const tipoMapeado = mapearTipoProceso(r.tipo_proceso || "");
      if (!tipoMapeado) continue; // INGRESO excluido

      const key = `${r.fecha}__${tipoMapeado}`;
      if (!grupos.has(key)) {
        grupos.set(key, { fecha: r.fecha, tipoProceso: tipoMapeado, cantidad: 0 });
      }
      grupos.get(key)!.cantidad += num(r.cantidad);

      if (r.created_at && (!updatedAt || r.created_at > updatedAt)) updatedAt = r.created_at;
    }

    const filas = Array.from(grupos.values()).sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1; // fecha más reciente primero
      const rankA = ORDEN_PROCESOS.indexOf(a.tipoProceso);
      const rankB = ORDEN_PROCESOS.indexOf(b.tipoProceso);
      return (rankA === -1 ? 100 : rankA) - (rankB === -1 ? 100 : rankB);
    });

    return NextResponse.json({ success: true, filas, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

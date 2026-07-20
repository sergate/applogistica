import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CargaInicialRow {
  pedidas: number | null;
  distribuidas: number | null;
  pendientes: number | null;
  stock_sp: number | null;
  stock: number | null;
  reservado: number | null;
  stock_total: number | null;
  created_at: string | null;
}

const num = (v: number | null): number => Number(v) || 0;

async function fetchAllCargaInicial(): Promise<CargaInicialRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: CargaInicialRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("carga_inicial")
      .select("pedidas, distribuidas, pendientes, stock_sp, stock, reservado, stock_total, created_at")
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

    const kpis = rows.reduce(
      (acc, r) => ({
        pedidas: acc.pedidas + num(r.pedidas),
        distribuidas: acc.distribuidas + num(r.distribuidas),
        pendientes: acc.pendientes + num(r.pendientes),
        stockSp: acc.stockSp + num(r.stock_sp),
        stock: acc.stock + num(r.stock),
        reservado: acc.reservado + num(r.reservado),
        stockTotal: acc.stockTotal + num(r.stock_total),
      }),
      { pedidas: 0, distribuidas: 0, pendientes: 0, stockSp: 0, stock: 0, reservado: 0, stockTotal: 0 }
    );

    let updatedAt: string | null = null;
    for (const r of rows) {
      if (r.created_at && (!updatedAt || r.created_at > updatedAt)) updatedAt = r.created_at;
    }

    return NextResponse.json({ success: true, kpis, totalRegistros: rows.length, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

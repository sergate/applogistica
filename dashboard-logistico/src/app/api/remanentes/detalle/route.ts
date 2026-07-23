import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllRemanentes, parseNumeroRemanente } from "@/lib/remanentesHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: number | null): number => Number(v) || 0;

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

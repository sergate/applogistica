import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllRemanentes, parseNumeroRemanente, RemanenteRow } from "@/lib/remanentesHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: number | null): number => Number(v) || 0;

// Algunas filas traen un stock_total absurdo (error de carga en el archivo
// origen) -- si supera el millón de unidades, se lo trata como dato inválido
// y se cuenta como 0 en vez de inflar el stock real.
const STOCK_MAX_VALIDO = 1_000_000;
const numStock = (v: number | null): number => {
  const n = Number(v) || 0;
  return n > STOCK_MAX_VALIDO ? 0 : n;
};

// El archivo origen repite el mismo stock_total en TODAS las filas de un
// mismo #SKU, en vez de traerlo una sola vez -- si se suma tal cual, el
// stock queda multiplicado por la cantidad de filas repetidas. Se cuenta el
// stock_total una sola vez por SKU, sin importar en qué archivo/numero esté
// -- el resto de las filas de ese SKU cuentan 0 de stock.
function stockDedupPorSku(rows: RemanenteRow[]): Map<RemanenteRow, number> {
  const stockPorFila = new Map<RemanenteRow, number>();
  const vistos = new Set<string>();

  for (const r of rows) {
    const sku = (r.sku || "").trim().toUpperCase();

    if (!sku) {
      // Sin SKU no hay combinación que deduplicar -- se cuenta tal cual.
      stockPorFila.set(r, numStock(r.stock_total));
      continue;
    }

    if (vistos.has(sku)) {
      stockPorFila.set(r, 0);
    } else {
      vistos.add(sku);
      stockPorFila.set(r, numStock(r.stock_total));
    }
  }

  return stockPorFila;
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
    // sube a esta tabla sin ese marcador, se ignora para los cálculos. El
    // dedup de stock por SKU se calcula solo sobre esas filas, para que un
    // archivo no-REMA con el mismo SKU no le "robe" el stock a una fila
    // REMA real.
    const rowsRema = rows.filter((r) => parseNumeroRemanente(r.numero).esRemanente);
    const stockPorFila = stockDedupPorSku(rowsRema);

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
        stock: number;
      }
    >();

    let updatedAt: string | null = null;

    for (const r of rowsRema) {
      const { marca, temporada } = parseNumeroRemanente(r.numero);

      const grupoNombre = (r.grupo || "").trim() || "SIN GRUPO";
      const key = `${marca}__${r.numero}__${grupoNombre}__${temporada}`;

      if (!grupos.has(key)) {
        grupos.set(key, { marca, archivo: r.numero, grupo: grupoNombre, temporada, pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 });
      }
      const acc = grupos.get(key)!;

      const pendientes = num(r.pendientes);
      const stockTotal = stockPorFila.get(r) ?? 0;

      acc.pedidas += num(r.pedidas);
      acc.distribuidas += num(r.distribuidas);
      acc.aRepartir += Math.min(pendientes, stockTotal);
      acc.stock += stockTotal;

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

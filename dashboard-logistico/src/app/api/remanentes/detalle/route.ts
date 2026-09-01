import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllRemanentes, parseNumeroRemanente, RemanenteRow } from "@/lib/remanentesHelpers";
import { requireAuth, esErrorAuth } from "@/lib/auth";

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
// mismo #SKU, en vez de traerlo una sola vez. El valor REAL de stock de un
// SKU es siempre el mismo (se toma la primera vez que aparece) -- se usa
// para "Unidades a Repartir" (min contra pendientes) en TODAS las filas de
// ese SKU, sin poner 0 en ninguna. Para "Unidades en Stock" sí hay que
// evitar sumar el mismo stock varias veces, así que ahí se cuenta una sola
// vez por SKU y el resto de las filas de ese SKU suman 0.
function stockRealPorSku(rows: RemanenteRow[]): Map<string, number> {
  const stockPorSku = new Map<string, number>();
  for (const r of rows) {
    const sku = (r.sku || "").trim().toUpperCase();
    if (!sku || stockPorSku.has(sku)) continue;
    stockPorSku.set(sku, numStock(r.stock_total));
  }
  return stockPorSku;
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
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
    const stockPorSku = stockRealPorSku(rowsRema);
    const skusYaSumadosParaStock = new Set<string>();

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
      const sku = (r.sku || "").trim().toUpperCase();
      const stockReal = sku ? (stockPorSku.get(sku) ?? 0) : numStock(r.stock_total);

      // "Unidades en Stock" solo suma el stock la primera vez que aparece
      // cada SKU (el resto de sus filas ya lo contaron).
      let stockParaSuma = 0;
      if (!sku) {
        stockParaSuma = numStock(r.stock_total);
      } else if (!skusYaSumadosParaStock.has(sku)) {
        skusYaSumadosParaStock.add(sku);
        stockParaSuma = stockReal;
      }

      acc.pedidas += num(r.pedidas);
      acc.distribuidas += num(r.distribuidas);
      acc.aRepartir += Math.min(pendientes, stockReal);
      acc.stock += stockParaSuma;

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

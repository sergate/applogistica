import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { UBICACION_STAGE } from "@/lib/lolea";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SkuRow {
  id: number;
  articulo: string;
  variante: string;
  unidad: string;
  stock_seguridad: number;
  grupo: string | null;
  orden: number;
  activo: boolean;
}

interface StockRow {
  sku_id: number;
  ubicacion: string;
  cantidad: number;
}

const PAGINA = 1000;
const MAX_FILAS_RESERVA = 20000;

// Pantalla "Stock" de Lolea: por artículo y variante, cuánto hay en stage, cuánto
// en posiciones, cuánto está reservado por pedidos ya planificados y cuánto queda
// disponible. Físico = stage + posiciones. Disponible = físico - reservado.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("LOL-Stock");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [skus, stock] = await Promise.all([
      fetchAllPaginated<SkuRow>("lol_skus", "id, articulo, variante, unidad, stock_seguridad, grupo, orden, activo"),
      fetchAllPaginated<StockRow>("lol_stock", "sku_id, ubicacion, cantidad"),
    ]);

    // Reserva: cada fila de pickeo sin cumplir de un pedido planificado.
    const reservaPorSku = new Map<number, number>();
    for (let inicio = 0; inicio < MAX_FILAS_RESERVA; inicio += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from("lol_picking")
        .select("id, sku_id, cantidad")
        .eq("ok", false)
        .order("id", { ascending: true })
        .range(inicio, inicio + PAGINA - 1);
      if (error) throw new Error(`Supabase (lol_picking): ${error.message}`);
      for (const f of (data || []) as { sku_id: number; cantidad: number }[]) {
        reservaPorSku.set(f.sku_id, (reservaPorSku.get(f.sku_id) ?? 0) + f.cantidad);
      }
      if (!data || data.length < PAGINA) break;
    }

    const stagePorSku = new Map<number, number>();
    const posicionesPorSku = new Map<number, number>();
    for (const f of stock) {
      const mapa = f.ubicacion === UBICACION_STAGE ? stagePorSku : posicionesPorSku;
      mapa.set(f.sku_id, (mapa.get(f.sku_id) ?? 0) + f.cantidad);
    }

    const filas = skus
      .filter((s) => s.activo)
      .sort((a, b) => a.orden - b.orden || a.articulo.localeCompare(b.articulo))
      .map((s) => ({
        id: s.id,
        grupo: s.grupo ?? "Sin grupo",
        articulo: s.articulo,
        variante: s.variante,
        unidad: s.unidad,
        seguridad: s.stock_seguridad,
        stage: stagePorSku.get(s.id) ?? 0,
        enPosiciones: posicionesPorSku.get(s.id) ?? 0,
        reservado: reservaPorSku.get(s.id) ?? 0,
      }));

    return NextResponse.json({ success: true, skus: filas });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

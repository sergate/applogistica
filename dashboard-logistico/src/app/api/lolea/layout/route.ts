import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { UBICACION_STAGE, ZONA_LOLEA } from "@/lib/lolea";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGINA = 1000;
const MAX_POSICIONES = 20000;

// Pantalla "Layout Lolea": las posiciones de la zona LOLEA y qué hay en cada una.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("LOL-Layout");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const layout: { ubicacion: string; nave: string | null }[] = [];
    for (let inicio = 0; inicio < MAX_POSICIONES; inicio += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from("almacen_layout")
        .select("ubicacion, nave")
        .eq("zona", ZONA_LOLEA)
        .order("ubicacion", { ascending: true })
        .range(inicio, inicio + PAGINA - 1);
      if (error) throw new Error(`Supabase (almacen_layout): ${error.message}`);
      layout.push(...((data || []) as { ubicacion: string; nave: string | null }[]));
      if (!data || data.length < PAGINA) break;
    }

    const [skus, stock] = await Promise.all([
      fetchAllPaginated<{ id: number; articulo: string; variante: string; unidad: string }>(
        "lol_skus",
        "id, articulo, variante, unidad"
      ),
      fetchAllPaginated<{ sku_id: number; ubicacion: string; cantidad: number }>(
        "lol_stock",
        "sku_id, ubicacion, cantidad"
      ),
    ]);

    const skuPorId = new Map(skus.map((s) => [s.id, s]));
    const articulosPorPosicion = new Map<
      string,
      { articulo: string; variante: string; unidad: string; cantidad: number }[]
    >();
    for (const f of stock) {
      if (f.ubicacion === UBICACION_STAGE || f.cantidad <= 0) continue;
      const sku = skuPorId.get(f.sku_id);
      if (!sku) continue;
      const lista = articulosPorPosicion.get(f.ubicacion) ?? [];
      lista.push({ articulo: sku.articulo, variante: sku.variante, unidad: sku.unidad, cantidad: f.cantidad });
      articulosPorPosicion.set(f.ubicacion, lista);
    }

    return NextResponse.json({
      success: true,
      posiciones: layout.map((p) => ({
        ubicacion: p.ubicacion,
        nave: p.nave,
        articulos: articulosPorPosicion.get(p.ubicacion) ?? [],
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

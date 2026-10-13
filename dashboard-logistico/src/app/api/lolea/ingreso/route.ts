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
  grupo: string | null;
  orden: number;
  activo: boolean;
}

interface MovimientoRow {
  id: number;
  sku_id: number;
  tipo: string;
  ubicacion_origen: string | null;
  ubicacion_destino: string | null;
  cantidad: number;
  motivo: string | null;
  usuario_id: string | null;
  creado_en: string;
}

const MOVIMIENTOS_A_MOSTRAR = 60;

// Pantalla "Ingreso": los artículos (para elegir artículo y variante), cuánto
// hay de cada uno en el stage esperando ubicarse, y los últimos movimientos de
// recepción y ubicación.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("LOL-Ingreso");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [skus, stock, movimientosRes] = await Promise.all([
      fetchAllPaginated<SkuRow>("lol_skus", "id, articulo, variante, unidad, grupo, orden, activo"),
      fetchAllPaginated<{ sku_id: number; ubicacion: string; cantidad: number }>(
        "lol_stock",
        "sku_id, ubicacion, cantidad"
      ),
      supabaseAdmin
        .from("lol_movimientos")
        .select("id, sku_id, tipo, ubicacion_origen, ubicacion_destino, cantidad, motivo, usuario_id, creado_en")
        .in("tipo", ["recepcion", "ubicacion"])
        .order("creado_en", { ascending: false })
        .order("id", { ascending: false })
        .limit(MOVIMIENTOS_A_MOSTRAR),
    ]);
    if (movimientosRes.error) throw new Error(`Supabase (lol_movimientos): ${movimientosRes.error.message}`);
    const movimientos = (movimientosRes.data || []) as MovimientoRow[];

    const stagePorSku = new Map<number, number>();
    for (const f of stock) {
      if (f.ubicacion === UBICACION_STAGE) stagePorSku.set(f.sku_id, f.cantidad);
    }

    const skuPorId = new Map(skus.map((s) => [s.id, s]));
    const usuarioIds = [...new Set(movimientos.map((m) => m.usuario_id).filter((id): id is string => !!id))];
    const { data: usuarios } = usuarioIds.length
      ? await supabaseAdmin.from("usuarios").select("id, nombre").in("id", usuarioIds)
      : { data: [] };
    const nombrePorId = new Map((usuarios || []).map((u: { id: string; nombre: string }) => [u.id, u.nombre]));

    return NextResponse.json({
      success: true,
      skus: skus
        .filter((s) => s.activo)
        .sort((a, b) => a.orden - b.orden || a.articulo.localeCompare(b.articulo))
        .map((s) => ({
          id: s.id,
          articulo: s.articulo,
          variante: s.variante,
          unidad: s.unidad,
          stage: stagePorSku.get(s.id) ?? 0,
        })),
      movimientos: movimientos.map((m) => ({
        id: m.id,
        fecha: m.creado_en,
        tipo: m.tipo,
        articulo: skuPorId.get(m.sku_id)?.articulo ?? "",
        variante: skuPorId.get(m.sku_id)?.variante ?? "",
        unidad: skuPorId.get(m.sku_id)?.unidad ?? "",
        cantidad: m.cantidad,
        destino: m.ubicacion_destino ?? "",
        referencia: m.motivo ?? "",
        usuario: m.usuario_id ? nombrePorId.get(m.usuario_id) ?? "Usuario eliminado" : "Sistema",
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

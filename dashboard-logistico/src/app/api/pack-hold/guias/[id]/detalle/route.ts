import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginatedIn } from "@/lib/fetchAllPaginated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Detalle de una guía en Pack and Hold: sus contenedores (del WMS), el packing
// list y las posiciones donde está registrada.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Posiciones");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const despachoCabId = Number(id);
    if (!Number.isFinite(despachoCabId)) {
      return NextResponse.json({ success: false, error: "Guía inválida." }, { status: 400 });
    }

    const [contenedores, packing, posiciones] = await Promise.all([
      fetchAllPaginatedIn<{ contenedor: string; unidades: number | null; remito: string | null }>(
        "ph_contenedores",
        "contenedor, unidades, remito",
        "despacho_cab_id",
        [despachoCabId]
      ),
      fetchAllPaginatedIn<{ contenedor: string; sku: string; cantidad: number | null }>(
        "ph_packing_list",
        "contenedor, sku, cantidad",
        "despacho_cab_id",
        [despachoCabId]
      ),
      supabaseAdmin
        .from("ph_posiciones")
        .select("posicion, contenedor_escaneado, registrada_en, registrada_por")
        .eq("despacho_cab_id", despachoCabId)
        .order("posicion", { ascending: true }),
    ]);
    if (posiciones.error) throw new Error(`Supabase (ph_posiciones): ${posiciones.error.message}`);

    const usuarioIds = [
      ...new Set(
        (posiciones.data || [])
          .map((p: { registrada_por: string | null }) => p.registrada_por)
          .filter((u): u is string => !!u)
      ),
    ];
    const { data: usuarios } = usuarioIds.length
      ? await supabaseAdmin.from("usuarios").select("id, nombre").in("id", usuarioIds)
      : { data: [] };
    const nombrePorId = new Map((usuarios || []).map((u: { id: string; nombre: string }) => [u.id, u.nombre]));

    return NextResponse.json({
      success: true,
      contenedores: contenedores.sort((a, b) => a.contenedor.localeCompare(b.contenedor)),
      packing: packing.sort((a, b) => a.contenedor.localeCompare(b.contenedor) || a.sku.localeCompare(b.sku)),
      posiciones: (posiciones.data || []).map(
        (p: { posicion: string; contenedor_escaneado: string | null; registrada_en: string | null; registrada_por: string | null }) => ({
          posicion: p.posicion,
          contenedorEscaneado: p.contenedor_escaneado,
          registradaEn: p.registrada_en,
          registradaPor: p.registrada_por ? nombrePorId.get(p.registrada_por) ?? null : null,
        })
      ),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

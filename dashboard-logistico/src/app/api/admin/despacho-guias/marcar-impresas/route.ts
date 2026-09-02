import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Acción de administrador para casos donde la guía y el remito ya se
// imprimieron a mano, fuera del sistema (por ejemplo, mientras el Agente
// Local estaba caído) -- marca ambos pasos como completos sin pasar por el
// Agente, dejando el mismo rastro de auditoría que un evento real.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const guiasBody = Array.isArray(body?.guias) ? body.guias : [];
    const ids = guiasBody
      .map((g: unknown) => (g && typeof g === "object" ? (g as { despachoCabId?: unknown }).despachoCabId : null))
      .filter((id: unknown): id is number => typeof id === "number" && Number.isInteger(id));

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "No se especificaron guías válidas." }, { status: 400 });
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();
    const nombre = usuario?.nombre || null;
    const ahora = new Date().toISOString();
    const mensaje = `Marcado manualmente como impreso por ${nombre || "un administrador"} (impresión ya realizada fuera del sistema).`;

    const { error: errorGuias } = await supabaseAdmin
      .from("despacho_guias")
      .update({
        guia_impresa: true,
        guia_impresa_en: ahora,
        guia_impresa_por_nombre: nombre,
        remito_impreso: true,
        remito_impreso_en: ahora,
        remito_impreso_por_nombre: nombre,
      })
      .in("despacho_cab_id", ids);
    if (errorGuias) throw new Error(`Supabase (despacho_guias): ${errorGuias.message}`);

    const eventos = guiasBody
      .filter((g: unknown) => g && typeof g === "object" && typeof (g as { despachoCabId?: unknown }).despachoCabId === "number")
      .flatMap((g: { despachoCabId: number; guia?: string | null }) => [
        {
          trabajo_id: null,
          despacho_cab_id: g.despachoCabId,
          guia: g.guia ?? null,
          tipo: "impresion",
          paso: "guia",
          resultado: "ok",
          mensaje,
          usuario_id: auth.userId,
        },
        {
          trabajo_id: null,
          despacho_cab_id: g.despachoCabId,
          guia: g.guia ?? null,
          tipo: "impresion",
          paso: "remito",
          resultado: "ok",
          mensaje,
          usuario_id: auth.userId,
        },
      ]);

    const { error: errorEventos } = await supabaseAdmin.from("despacho_impresion_eventos").insert(eventos);
    if (errorEventos) throw new Error(`Supabase (despacho_impresion_eventos): ${errorEventos.message}`);

    return NextResponse.json({ success: true, actualizadas: ids.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

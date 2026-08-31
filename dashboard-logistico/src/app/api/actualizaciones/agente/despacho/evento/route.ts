import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Llamado por el Agente Local después de CADA paso (guía o remito) de CADA
// guía dentro de un pedido de impresión/reimpresión -- registra el intento
// en el log de auditoría y, si salió bien, refleja el estado en
// despacho_guias para que la grilla lo muestre en vivo.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const trabajoId = body?.trabajoId;
    const despachoCabId = body?.despachoCabId;
    const guia = body?.guia ?? null;
    const tipo = body?.tipo; // "impresion" | "reimpresion"
    const paso = body?.paso; // "guia" | "remito"
    const resultado = body?.resultado; // "ok" | "error"
    const mensaje = typeof body?.mensaje === "string" ? body.mensaje.slice(0, 2000) : null;

    if (
      typeof trabajoId !== "number" ||
      typeof despachoCabId !== "number" ||
      (tipo !== "impresion" && tipo !== "reimpresion") ||
      (paso !== "guia" && paso !== "remito") ||
      (resultado !== "ok" && resultado !== "error")
    ) {
      return NextResponse.json({ success: false, error: "Body inválido." }, { status: 400 });
    }

    const { error: errorEvento } = await supabaseAdmin.from("despacho_impresion_eventos").insert({
      trabajo_id: trabajoId,
      despacho_cab_id: despachoCabId,
      guia,
      tipo,
      paso,
      resultado,
      mensaje,
      usuario_id: auth.userId,
    });
    if (errorEvento) throw new Error(`Supabase (despacho_impresion_eventos): ${errorEvento.message}`);

    if (resultado === "ok") {
      const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();
      const nombre = usuario?.nombre || null;
      const ahora = new Date().toISOString();

      const patch =
        paso === "guia"
          ? { guia_impresa: true, guia_impresa_en: ahora, guia_impresa_por_nombre: nombre }
          : { remito_impreso: true, remito_impreso_en: ahora, remito_impreso_por_nombre: nombre };

      const { error: errorGuia } = await supabaseAdmin
        .from("despacho_guias")
        .update(patch)
        .eq("despacho_cab_id", despachoCabId);
      if (errorGuia) throw new Error(`Supabase (despacho_guias): ${errorGuia.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Llamado por el Agente Local al terminar (bien o mal) un pedido que había
// tomado con /agente/proximo.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const id = body?.id;
    const exito = body?.exito;
    const mensaje = typeof body?.mensaje === "string" ? body.mensaje.slice(0, 2000) : null;

    if (typeof id !== "number" || typeof exito !== "boolean") {
      return NextResponse.json({ success: false, error: "Body inválido (se espera id y exito)." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("actualizaciones_wms")
      .update({ estado: exito ? "ok" : "error", mensaje, finished_at: new Date().toISOString() })
      .eq("id", id)
      .eq("usuario_id", auth.userId); // un agente solo puede cerrar pedidos de su propio usuario

    if (error) throw new Error(`Supabase (actualizaciones_wms): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

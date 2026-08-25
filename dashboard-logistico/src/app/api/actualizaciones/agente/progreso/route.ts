import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Llamado por el Agente Local a medida que avanza (después de cada reporte
// bajado, y durante la subida) para que el botón muestre una barra de
// progreso real en vez de un simple "Actualizando...".
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const id = body?.id;
    const progreso = body?.progreso;
    const paso = typeof body?.paso === "string" ? body.paso.slice(0, 200) : null;

    if (typeof id !== "number" || typeof progreso !== "number") {
      return NextResponse.json({ success: false, error: "Body inválido (se espera id y progreso)." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("actualizaciones_wms")
      .update({ progreso: Math.max(0, Math.min(100, Math.round(progreso))), paso })
      .eq("id", id)
      .eq("usuario_id", auth.userId)
      .eq("estado", "corriendo"); // no pisar el progreso de un pedido que ya se cerró

    if (error) throw new Error(`Supabase (actualizaciones_wms): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

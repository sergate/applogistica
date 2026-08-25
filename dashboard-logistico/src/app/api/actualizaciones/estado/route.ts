import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, esSeccionValida, usuarioDesdeSesion } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consulta el pedido más reciente del usuario para una sección (lo usa el
// botón para hacer polling y mostrar "Actualizando... / Listo / Error").
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeSesion();
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const seccion = request.nextUrl.searchParams.get("seccion");
    if (!esSeccionValida(seccion)) {
      return NextResponse.json({ success: false, error: "Sección inválida." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("actualizaciones_wms")
      .select("id, estado, mensaje, progreso, paso, created_at, started_at, finished_at")
      .eq("usuario_id", auth.userId)
      .eq("seccion", seccion)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Supabase (actualizaciones_wms): ${error.message}`);

    return NextResponse.json({ success: true, pedido: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

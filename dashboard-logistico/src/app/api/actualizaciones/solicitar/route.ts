import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, esSeccionValida, usuarioDesdeSesion } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Crea un pedido de actualización para el usuario logueado. Si ya tiene uno
// pendiente/corriendo para la misma sección, lo reusa en vez de duplicar
// (evita que dos clicks seguidos disparen dos corridas del Agente).
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeSesion();
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const seccion = body?.seccion;
    if (!esSeccionValida(seccion)) {
      return NextResponse.json({ success: false, error: "Sección inválida." }, { status: 400 });
    }

    const { data: existente } = await supabaseAdmin
      .from("actualizaciones_wms")
      .select("id, estado")
      .eq("usuario_id", auth.userId)
      .eq("seccion", seccion)
      .in("estado", ["pendiente", "corriendo"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente) {
      return NextResponse.json({ success: true, id: existente.id, estado: existente.estado, reusado: true });
    }

    const { data: nuevo, error } = await supabaseAdmin
      .from("actualizaciones_wms")
      .insert({ usuario_id: auth.userId, seccion, estado: "pendiente" })
      .select("id, estado")
      .single();

    if (error) throw new Error(`Supabase (actualizaciones_wms): ${error.message}`);

    return NextResponse.json({ success: true, id: nuevo.id, estado: nuevo.estado, reusado: false });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vista de diagnóstico: últimos eventos de impresión/reimpresión (uno por
// paso -- guía o remito -- de cada guía procesada), para poder ver el motivo
// puntual de una falla sin tener que mirar la consola del Agente Local
// (que corre sin ventana visible cuando lo dispara la Tarea Programada).
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const trabajoId = request.nextUrl.searchParams.get("trabajoId");
    const soloErrores = request.nextUrl.searchParams.get("soloErrores") === "1";
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 100, 500);

    let query = supabaseAdmin
      .from("despacho_impresion_eventos")
      .select("id, trabajo_id, despacho_cab_id, guia, tipo, paso, resultado, mensaje, usuario_id, ocurrido_en")
      .order("ocurrido_en", { ascending: false })
      .limit(limit);

    if (trabajoId) query = query.eq("trabajo_id", Number(trabajoId));
    if (soloErrores) query = query.eq("resultado", "error");

    const { data, error } = await query;
    if (error) throw new Error(`Supabase (despacho_impresion_eventos): ${error.message}`);

    return NextResponse.json({ success: true, eventos: data || [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

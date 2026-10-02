import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Llamado por el Agente Local justo antes de bajar los reportes de
// Remanentes (ci_rema): además de las opciones del combo "Pedido" de Resumen
// CI que contienen REMA, baja las que figuren en esta lista (cargada en
// Status Remanentes -> Carga Datos). Ver wms-reportes/agente-local.js.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { data, error } = await supabaseAdmin.from("remanentes_archivos_manuales").select("archivo").order("id");
    if (error) throw new Error(`Supabase (remanentes_archivos_manuales): ${error.message}`);

    return NextResponse.json({ success: true, archivos: (data || []).map((r) => r.archivo) });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

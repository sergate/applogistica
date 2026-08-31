import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Llamado por el Agente Local (autenticado con su token personal, no con
// sesión de navegador). Devuelve el pedido pendiente más viejo de ESE
// usuario y lo marca "corriendo" atómicamente, para que dos agentes (o dos
// polls seguidos) no tomen el mismo pedido dos veces.
export async function GET(request: Request) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { data: candidato } = await supabaseAdmin
      .from("actualizaciones_wms")
      .select("id")
      .eq("usuario_id", auth.userId)
      .eq("estado", "pendiente")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!candidato) {
      return NextResponse.json({ success: true, pedido: null });
    }

    const { data: tomado, error } = await supabaseAdmin
      .from("actualizaciones_wms")
      .update({ estado: "corriendo", started_at: new Date().toISOString() })
      .eq("id", candidato.id)
      .eq("estado", "pendiente") // concurrencia optimista: si alguien más ya lo tomó, esto no matchea nada
      .select("id, seccion, payload")
      .maybeSingle();

    if (error) throw new Error(`Supabase (actualizaciones_wms): ${error.message}`);

    return NextResponse.json({ success: true, pedido: tomado || null });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El Agente Local solo conoce su token -- lo llama una vez al arrancar para
// saber su propio usuarioId y poder suscribirse al canal Realtime
// "actualizaciones:agente:<usuarioId>" (ver src/lib/realtimeBroadcast.ts)
// en vez de tener que poleaer /agente/proximo todo el tiempo.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    return NextResponse.json({ success: true, usuarioId: auth.userId });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

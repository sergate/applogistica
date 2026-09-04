import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { parseCodigoClienteDespacho } from "@/lib/pendienteDespachoHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Trae lo que hay disponible para armar una Hoja de Ruta de un local en una
// fecha: interlocales pendientes (misma tabla que usa /api/interlocales) +
// guías de despacho del WMS todavía no incluidas en otra hoja. El "local"
// de una guía de despacho no es una columna propia -- se deriva del código
// que encabeza el texto de "cliente" (mismo criterio que ya usa el módulo
// Despacho para los Grupos de Clientes).
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const params = request.nextUrl.searchParams;
    const localDestino = (params.get("localDestino") || "").trim();
    const fecha = (params.get("fecha") || "").trim();

    if (!localDestino) {
      return NextResponse.json({ success: false, error: "Falta el local destino." }, { status: 400 });
    }
    if (!fecha) {
      return NextResponse.json({ success: false, error: "Falta la fecha." }, { status: 400 });
    }

    const { data: interlocales, error: errorInterlocales } = await supabaseAdmin
      .from("interlocales")
      .select("*")
      .eq("estado", "pendiente")
      .eq("local_destino_codigo", localDestino)
      .eq("fecha", fecha)
      .order("registrado_en");
    if (errorInterlocales) throw new Error(`Supabase (interlocales): ${errorInterlocales.message}`);

    const { data: despachosDelDia, error: errorDespachos } = await supabaseAdmin
      .from("despacho_guias")
      .select("*")
      .is("hoja_de_ruta_id", null)
      .order("fecha_creacion");
    if (errorDespachos) throw new Error(`Supabase (despacho_guias): ${errorDespachos.message}`);

    const despachos = (despachosDelDia || []).filter(
      (d) => parseCodigoClienteDespacho(d.cliente) === localDestino
    );

    return NextResponse.json({ success: true, interlocales: interlocales || [], despachos });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

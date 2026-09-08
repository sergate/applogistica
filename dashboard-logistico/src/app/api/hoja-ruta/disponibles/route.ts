import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { parseCodigoClienteDespacho } from "@/lib/pendienteDespachoHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Trae lo que hay disponible para armar (o editar) una Hoja de Ruta de un
// local: interlocales pendientes (misma tabla que usa /api/interlocales) +
// guías de despacho del WMS todavía no incluidas en otra hoja -- sin
// filtrar por fecha, trae TODO lo pendiente para ese local. El "local" de
// una guía de despacho no es una columna propia -- se deriva del código que
// encabeza el texto de "cliente" (mismo criterio que ya usa el módulo
// Despacho para los Grupos de Clientes).
//
// Si se pasa "hojaId" (modo edición), además de lo disponible se incluye lo
// que ya está tomado por ESA hoja puntual, para poder mostrarlo
// preseleccionado y permitir sacarlo.
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
    const hojaIdParam = (params.get("hojaId") || "").trim();
    const hojaId = hojaIdParam ? Number(hojaIdParam) : null;

    if (!localDestino) {
      return NextResponse.json({ success: false, error: "Falta el local destino." }, { status: 400 });
    }

    const { data: interlocalesPendientes, error: errorInterlocales } = await supabaseAdmin
      .from("interlocales")
      .select("*")
      .eq("estado", "pendiente")
      .eq("local_destino_codigo", localDestino)
      .order("registrado_en");
    if (errorInterlocales) throw new Error(`Supabase (interlocales): ${errorInterlocales.message}`);

    const { data: despachosDisponibles, error: errorDespachos } = await supabaseAdmin
      .from("despacho_guias")
      .select("*")
      .is("hoja_de_ruta_id", null)
      .order("fecha_creacion");
    if (errorDespachos) throw new Error(`Supabase (despacho_guias): ${errorDespachos.message}`);

    // Las guías ya despachadas (estado_wms = "DP_COT_OK" -- Código de
    // Operación de Traslado de ARBA aprobado, confirmado contra guías
    // reales) no tienen que ofrecerse para armar una Hoja de Ruta nueva.
    let interlocales = interlocalesPendientes || [];
    let despachos = (despachosDisponibles || []).filter(
      (d) => parseCodigoClienteDespacho(d.cliente) === localDestino && d.estado_wms !== "DP_COT_OK"
    );

    if (hojaId && Number.isFinite(hojaId)) {
      const { data: interlocalesDeEstaHoja, error: errInterHoja } = await supabaseAdmin
        .from("interlocales")
        .select("*")
        .eq("hoja_de_ruta_id", hojaId);
      if (errInterHoja) throw new Error(`Supabase (interlocales): ${errInterHoja.message}`);

      const { data: despachosDeEstaHoja, error: errDespHoja } = await supabaseAdmin
        .from("despacho_guias")
        .select("*")
        .eq("hoja_de_ruta_id", hojaId);
      if (errDespHoja) throw new Error(`Supabase (despacho_guias): ${errDespHoja.message}`);

      const idsYaListados = new Set(interlocales.map((i) => i.id));
      for (const i of interlocalesDeEstaHoja || []) {
        if (!idsYaListados.has(i.id)) interlocales = [...interlocales, i];
      }
      const cabIdsYaListados = new Set(despachos.map((d) => d.despacho_cab_id));
      for (const d of despachosDeEstaHoja || []) {
        if (!cabIdsYaListados.has(d.despacho_cab_id)) despachos = [...despachos, d];
      }
    }

    return NextResponse.json({ success: true, interlocales, despachos });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

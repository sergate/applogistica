import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cuántos días hacia atrás mirar -- solo hace falta cubrir guías recientes
// que quedaron a mitad de camino de un import (ver
// wms-reportes/agente-local.js -> completarPackingListsFaltantes()), no
// arrastrar para siempre guías viejas que por algún motivo nunca tuvieron
// packing list (esas se ven y se resuelven a mano).
const VENTANA_DIAS_ATRAS = 7;

// Llamado periódicamente por el Agente Local (sin que nadie apriete ningún
// botón) para encontrar guías Propio cuyo packing list todavía no se
// procesó -- bultos_insumos sigue en NULL porque el import de la cabecera
// (rápido, sube todo junto) terminó antes que el desglose por caja/SKU
// (lento, consulta el WMS guía por guía dentro del mismo job), o porque esa
// consulta puntual falló. Mientras esto no se complete, la vista de
// impresión de la Hoja de Ruta bloquea imprimir esas guías.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const desde = new Date(Date.now() - VENTANA_DIAS_ATRAS * 86400000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("despacho_guias")
      .select("despacho_cab_id, guia, numero_guia")
      .ilike("tipo", "PROPIO")
      .is("bultos_insumos", null)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(`Supabase (despacho_guias): ${error.message}`);

    return NextResponse.json({ success: true, pendientes: data || [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

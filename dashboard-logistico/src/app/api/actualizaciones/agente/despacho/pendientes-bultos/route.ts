import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";
import { fetchAllPaginatedIn } from "@/lib/fetchAllPaginated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cuántos días hacia atrás mirar y cuántas guías devolver por consulta.
const VENTANA_DIAS_ATRAS = 14;
const MAX_GUIAS = 300;
const PAGINA = 1000;
const MAX_GUIAS_VENTANA = 5000;

interface GuiaRow {
  despacho_cab_id: number;
  guia: string | null;
  numero_guia: string | null;
  tipo: string | null;
}

// Llamado periódicamente por el Agente Local (ver wms-reportes/agente-local.js
// -> completarBultosFaltantes()) para encontrar guías recientes que no tienen
// ninguna caja en despacho_guias_bultos: el detalle se baja una sola vez al
// importar, y si en ese momento la guía todavía se estaba armando o la consulta
// falló, quedaba sin cajas para siempre y el escáner de la Hoja de Ruta no
// reconocía sus bultos.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const desde = new Date(Date.now() - VENTANA_DIAS_ATRAS * 86400000).toISOString();

    const guias: GuiaRow[] = [];
    for (let inicio = 0; inicio < MAX_GUIAS_VENTANA; inicio += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from("despacho_guias")
        .select("despacho_cab_id, guia, numero_guia, tipo")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .order("despacho_cab_id", { ascending: false })
        .range(inicio, inicio + PAGINA - 1);
      if (error) throw new Error(`Supabase (despacho_guias): ${error.message}`);
      guias.push(...((data || []) as GuiaRow[]));
      if (!data || data.length < PAGINA) break;
    }

    const conBultos = new Set(
      (
        await fetchAllPaginatedIn<{ despacho_cab_id: number }>(
          "despacho_guias_bultos",
          "despacho_cab_id",
          "despacho_cab_id",
          guias.map((g) => g.despacho_cab_id)
        )
      ).map((b) => b.despacho_cab_id)
    );

    const pendientes = guias.filter((g) => !conBultos.has(g.despacho_cab_id)).slice(0, MAX_GUIAS);
    return NextResponse.json({ success: true, pendientes });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

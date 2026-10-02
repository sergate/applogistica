import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { esContenedorCI, normalizarNumeroContenedor } from "@/lib/pendienteDespachoHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lo consulta el Agente Local después de importar Pendiente de Despacho
// (Clientes o Propios): cuántos contenedores CI de esas tablas todavía no
// tienen marca en wms_contenedores. Si hay faltantes (y el mapeo no se
// actualizó hace poco, ver ultimaActualizacion), el Agente baja el reporte
// de Contenedores del WMS; si no, se saltea la descarga.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const [clientes, propios, conocidos] = await Promise.all([
      fetchAllPaginated<{ numero: string | null }>("pendiente_despacho_clientes", "numero"),
      fetchAllPaginated<{ numero: string | null }>("pendiente_despacho_propios", "numero"),
      fetchAllPaginated<{ contenedor: string; updated_at: string | null }>("wms_contenedores", "contenedor, updated_at"),
    ]);

    const mapeados = new Set(conocidos.map((c) => normalizarNumeroContenedor(c.contenedor)));
    let ultimaActualizacion: string | null = null;
    for (const c of conocidos) {
      if (c.updated_at && (!ultimaActualizacion || c.updated_at > ultimaActualizacion)) ultimaActualizacion = c.updated_at;
    }

    const faltantes = new Set<string>();
    for (const f of [...clientes, ...propios]) {
      const numero = normalizarNumeroContenedor(f.numero);
      if (esContenedorCI(numero) && !mapeados.has(numero)) faltantes.add(numero);
    }

    return NextResponse.json({ success: true, faltantes: faltantes.size, ultimaActualizacion });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

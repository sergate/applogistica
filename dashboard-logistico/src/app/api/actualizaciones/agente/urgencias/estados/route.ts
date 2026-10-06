import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EstadoContenedor {
  contenedor?: string | null;
  estado?: string | null;
}

// Agrupa los contenedores por estado y hace un update por estado (en vez de
// uno por contenedor): son pocos estados distintos y muchos contenedores.
const CHUNK_IN = 200;

// Llamado por el Agente Local con el estado real de cada contenedor en el WMS.
// Un contenedor que el WMS no devolvió llega con estado vacío y queda como
// "NO ENCONTRADO".
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const estados = body?.estados;
    if (!Array.isArray(estados)) {
      return NextResponse.json({ success: false, error: '"estados" debe ser un array.' }, { status: 400 });
    }

    const porEstado = new Map<string, string[]>();
    for (const e of estados as EstadoContenedor[]) {
      const contenedor = String(e?.contenedor ?? "").trim();
      if (!contenedor) continue;
      const estado = String(e?.estado ?? "").trim().toUpperCase() || "NO ENCONTRADO";
      const lista = porEstado.get(estado) ?? [];
      lista.push(contenedor);
      porEstado.set(estado, lista);
    }

    const ahora = new Date().toISOString();
    let actualizados = 0;
    for (const [estado, contenedores] of porEstado) {
      for (let i = 0; i < contenedores.length; i += CHUNK_IN) {
        const lote = contenedores.slice(i, i + CHUNK_IN);
        const { error } = await supabaseAdmin
          .from("urgencias_contenedores")
          .update({ estado_wms: estado, estado_wms_en: ahora })
          .in("contenedor", lote);
        if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);
        actualizados += lote.length;
      }
    }

    return NextResponse.json({ success: true, actualizados });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

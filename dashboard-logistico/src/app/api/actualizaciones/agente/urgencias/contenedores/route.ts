import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lo consulta el Agente Local: lista (sin repetir) de los contenedores cargados
// en los bloques de Seguimiento Urgencias, para pedirle al WMS el estado de cada uno.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const filas = await fetchAllPaginated<{ contenedor: string }>("urgencias_contenedores", "contenedor");
    const contenedores = Array.from(new Set(filas.map((f) => f.contenedor.trim()).filter(Boolean)));

    return NextResponse.json({ success: true, contenedores });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

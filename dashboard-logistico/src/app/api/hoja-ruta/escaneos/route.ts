import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Listado de sesiones de escaneo (control de bultos por handheld), con los
// datos de la hoja y -- si quedó incompleta -- los bultos que faltaron.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data: escaneos, error: errorEscaneos } = await supabaseAdmin
      .from("hoja_de_ruta_escaneos")
      .select("*")
      .order("iniciado_en", { ascending: false })
      .limit(200);
    if (errorEscaneos) throw new Error(`Supabase (hoja_de_ruta_escaneos): ${errorEscaneos.message}`);

    const hojaIds = [...new Set((escaneos || []).map((e) => e.hoja_de_ruta_id))];
    const { data: hojas } =
      hojaIds.length > 0
        ? await supabaseAdmin.from("hojas_de_ruta").select("id, fecha, local_codigo, local_nombre").in("id", hojaIds)
        : { data: [] };
    const hojaPorId = new Map((hojas || []).map((h) => [h.id, h]));

    const escaneoIds = (escaneos || []).map((e) => e.id);
    const { data: faltantes } =
      escaneoIds.length > 0
        ? await supabaseAdmin
            .from("hoja_de_ruta_bultos_faltantes")
            .select("escaneo_id, codigo, tipo")
            .in("escaneo_id", escaneoIds)
        : { data: [] };
    const faltantesPorEscaneo = new Map<number, { codigo: string; tipo: string | null }[]>();
    for (const f of faltantes || []) {
      if (!faltantesPorEscaneo.has(f.escaneo_id)) faltantesPorEscaneo.set(f.escaneo_id, []);
      faltantesPorEscaneo.get(f.escaneo_id)!.push({ codigo: f.codigo, tipo: f.tipo });
    }

    const filas = (escaneos || []).map((e) => ({
      ...e,
      hoja: hojaPorId.get(e.hoja_de_ruta_id) || null,
      faltantes: faltantesPorEscaneo.get(e.id) || [],
    }));

    return NextResponse.json({ success: true, filas });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

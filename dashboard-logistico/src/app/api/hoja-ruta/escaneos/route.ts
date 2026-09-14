import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { bultosEsperadosPorHoja } from "@/lib/hojaDeRutaBultos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Listado de sesiones de escaneo (control de bultos por handheld), con los
// datos de la hoja y el detalle bulto por bulto (esperado vs escaneado) de
// cada sesión -- alimenta tanto el desplegable como el export a Excel.
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

    const esperadosPorHoja = await bultosEsperadosPorHoja(hojaIds);

    const escaneoIds = (escaneos || []).map((e) => e.id);
    const { data: eventosOk } =
      escaneoIds.length > 0
        ? await supabaseAdmin
            .from("hoja_de_ruta_escaneo_eventos")
            .select("escaneo_id, codigo, escaneado_en")
            .in("escaneo_id", escaneoIds)
            .eq("resultado", "ok_nuevo")
        : { data: [] };
    const escaneadoEnPorEscaneo = new Map<number, Map<string, string>>();
    for (const ev of eventosOk || []) {
      if (!escaneadoEnPorEscaneo.has(ev.escaneo_id)) escaneadoEnPorEscaneo.set(ev.escaneo_id, new Map());
      escaneadoEnPorEscaneo.get(ev.escaneo_id)!.set(ev.codigo, ev.escaneado_en);
    }

    const filas = (escaneos || []).map((e) => {
      const esperados = esperadosPorHoja.get(e.hoja_de_ruta_id) || [];
      const escaneadoMap = escaneadoEnPorEscaneo.get(e.id) || new Map<string, string>();
      const detalle = esperados.map((b) => ({
        ...b,
        escaneado: escaneadoMap.has(b.codigo),
        escaneado_en: escaneadoMap.get(b.codigo) || null,
      }));
      return { ...e, hoja: hojaPorId.get(e.hoja_de_ruta_id) || null, detalle };
    });

    return NextResponse.json({ success: true, filas });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

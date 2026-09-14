import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { bultosEsperadosPorHoja } from "@/lib/hojaDeRutaBultos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Arranca (o retoma) una sesión de escaneo para una Hoja de Ruta: crea la
// fila en hoja_de_ruta_escaneos y devuelve la hoja + la lista de bultos
// esperados (cajas de despacho + etiquetas de interlocal) para que el
// handheld pueda ir matcheando cada escaneo localmente.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const hojaId = Number(id);
    if (!Number.isFinite(hojaId)) {
      return NextResponse.json({ success: false, error: "ID de hoja de ruta inválido." }, { status: 400 });
    }

    const { data: hoja, error: errorHoja } = await supabaseAdmin
      .from("hojas_de_ruta")
      .select("*")
      .eq("id", hojaId)
      .maybeSingle();
    if (errorHoja) throw new Error(`Supabase (hojas_de_ruta): ${errorHoja.message}`);
    if (!hoja) return NextResponse.json({ success: false, error: "No existe esa hoja de ruta." }, { status: 404 });
    if (hoja.estado === "anulada") {
      return NextResponse.json({ success: false, error: "Esta hoja de ruta está anulada." }, { status: 400 });
    }

    const bultosEsperados = (await bultosEsperadosPorHoja([hojaId])).get(hojaId) || [];

    // Códigos duplicados entre bultos (no debería pasar, pero por las dudas
    // no rompemos el conteo esperado).
    const codigosUnicos = new Set(bultosEsperados.map((b) => b.codigo));

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const { data: escaneo, error: errorEscaneo } = await supabaseAdmin
      .from("hoja_de_ruta_escaneos")
      .insert({
        hoja_de_ruta_id: hojaId,
        usuario_id: auth.userId,
        usuario_nombre: usuario?.nombre || null,
        bultos_esperados: codigosUnicos.size,
      })
      .select("id")
      .single();
    if (errorEscaneo) throw new Error(`Supabase (hoja_de_ruta_escaneos): ${errorEscaneo.message}`);

    return NextResponse.json({
      success: true,
      escaneoId: escaneo.id,
      hoja: { id: hoja.id, fecha: hoja.fecha, local_codigo: hoja.local_codigo, local_nombre: hoja.local_nombre },
      bultosEsperados,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

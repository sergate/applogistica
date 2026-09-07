import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anula una Hoja de Ruta y libera todo lo que tenía adentro: los
// interlocales vuelven a "pendiente" y las guías de despacho vuelven a estar
// disponibles para otra hoja.
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

    const { data: hoja } = await supabaseAdmin.from("hojas_de_ruta").select("estado").eq("id", hojaId).maybeSingle();
    if (!hoja) return NextResponse.json({ success: false, error: "No existe esa hoja de ruta." }, { status: 404 });
    if (hoja.estado === "anulada") {
      return NextResponse.json({ success: false, error: "Esta hoja de ruta ya está anulada." }, { status: 400 });
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const { error: errInter } = await supabaseAdmin
      .from("interlocales")
      .update({ estado: "pendiente", hoja_de_ruta_id: null })
      .eq("hoja_de_ruta_id", hojaId);
    if (errInter) throw new Error(`Supabase (interlocales): ${errInter.message}`);

    const { error: errDesp } = await supabaseAdmin
      .from("despacho_guias")
      .update({ hoja_de_ruta_id: null })
      .eq("hoja_de_ruta_id", hojaId);
    if (errDesp) throw new Error(`Supabase (despacho_guias): ${errDesp.message}`);

    const { data, error } = await supabaseAdmin
      .from("hojas_de_ruta")
      .update({
        estado: "anulada",
        anulada_en: new Date().toISOString(),
        anulada_por_nombre: usuario?.nombre || null,
      })
      .eq("id", hojaId)
      .select("*")
      .single();
    if (error) throw new Error(`Supabase (hojas_de_ruta): ${error.message}`);

    return NextResponse.json({ success: true, hoja: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

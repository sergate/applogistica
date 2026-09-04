import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marca la hoja como impresa. Se llama después de abrir la vista imprimible
// del navegador -- no dispara la impresión en sí (eso lo maneja el
// navegador), solo deja constancia de quién y cuándo la confirmó.
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
      return NextResponse.json({ success: false, error: "Esta hoja de ruta está anulada." }, { status: 400 });
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const { data, error } = await supabaseAdmin
      .from("hojas_de_ruta")
      .update({
        estado: "impresa",
        impresa_en: new Date().toISOString(),
        impresa_por_id: auth.userId,
        impresa_por_nombre: usuario?.nombre || null,
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

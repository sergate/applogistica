import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Detalle completo de una Hoja de Ruta -- cabecera + ítems, cada uno con los
// datos de origen resueltos (interlocal o guía de despacho). Es lo que
// alimenta la vista imprimible.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: items, error: errorItems } = await supabaseAdmin
      .from("hoja_de_ruta_items")
      .select("*")
      .eq("hoja_de_ruta_id", hojaId)
      .order("orden");
    if (errorItems) throw new Error(`Supabase (hoja_de_ruta_items): ${errorItems.message}`);

    const interlocalIds = (items || []).filter((i) => i.tipo === "interlocal").map((i) => i.referencia_id);
    const despachoIds = (items || []).filter((i) => i.tipo === "despacho").map((i) => i.referencia_id);

    const [{ data: interlocales, error: errInter }, { data: despachos, error: errDesp }] = await Promise.all([
      interlocalIds.length > 0
        ? supabaseAdmin.from("interlocales").select("*").in("id", interlocalIds)
        : Promise.resolve({ data: [], error: null }),
      despachoIds.length > 0
        ? supabaseAdmin.from("despacho_guias").select("*").in("despacho_cab_id", despachoIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (errInter) throw new Error(`Supabase (interlocales): ${errInter.message}`);
    if (errDesp) throw new Error(`Supabase (despacho_guias): ${errDesp.message}`);

    const interlocalPorId = new Map((interlocales || []).map((i) => [i.id, i]));
    const despachoPorId = new Map((despachos || []).map((d) => [d.despacho_cab_id, d]));

    const itemsResueltos = (items || []).map((it) => ({
      ...it,
      detalle: it.tipo === "interlocal" ? interlocalPorId.get(it.referencia_id) || null : despachoPorId.get(it.referencia_id) || null,
    }));

    return NextResponse.json({ success: true, hoja, items: itemsResueltos });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

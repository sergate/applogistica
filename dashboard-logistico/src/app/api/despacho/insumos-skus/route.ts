import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Maestro de SKU de insumos (~112 SKU) que administra Despacho -> SKU de
// Insumos (Admin) -- cada fila acá es un SKU catalogado como insumo, usado
// para clasificar cajas del packing list de guías Propio.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-SkuInsumos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("insumos_skus_maestro")
      .select("sku, descripcion, creado_en, creado_por_nombre")
      .order("sku");
    if (error) throw new Error(`Supabase (insumos_skus_maestro): ${error.message}`);

    return NextResponse.json({ success: true, items: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-SkuInsumos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const sku = typeof body?.sku === "string" ? body.sku.trim() : "";
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() || null : null;

    if (!sku) {
      return NextResponse.json({ success: false, error: 'Falta "sku".' }, { status: 400 });
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const { error } = await supabaseAdmin.from("insumos_skus_maestro").upsert(
      { sku, descripcion, creado_en: new Date().toISOString(), creado_por_nombre: usuario?.nombre || null },
      { onConflict: "sku" }
    );
    if (error) throw new Error(`Supabase (insumos_skus_maestro - upsert): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-SkuInsumos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const sku = request.nextUrl.searchParams.get("sku");
    if (!sku) {
      return NextResponse.json({ success: false, error: 'Falta "sku".' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("insumos_skus_maestro").delete().eq("sku", sku);
    if (error) throw new Error(`Supabase (insumos_skus_maestro - borrado): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

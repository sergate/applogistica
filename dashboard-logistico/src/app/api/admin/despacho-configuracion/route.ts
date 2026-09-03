import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración general del módulo Despacho (fila única, id=1), editable
// desde el panel "Grupos de Clientes (Admin)" -- mismo permiso que ese panel.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("despacho_configuracion")
      .select("ocultar_tipo_cliente")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`Supabase (despacho_configuracion): ${error.message}`);

    return NextResponse.json({ success: true, ocultarTipoCliente: data?.ocultar_tipo_cliente ?? false });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    if (typeof body?.ocultarTipoCliente !== "boolean") {
      return NextResponse.json({ success: false, error: 'Falta "ocultarTipoCliente" (boolean).' }, { status: 400 });
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const { error } = await supabaseAdmin.from("despacho_configuracion").upsert({
      id: 1,
      ocultar_tipo_cliente: body.ocultarTipoCliente,
      actualizado_en: new Date().toISOString(),
      actualizado_por_nombre: usuario?.nombre || null,
    });
    if (error) throw new Error(`Supabase (despacho_configuracion): ${error.message}`);

    return NextResponse.json({ success: true, ocultarTipoCliente: body.ocultarTipoCliente });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

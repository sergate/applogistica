import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) {
      return NextResponse.json({ success: false, error: "Falta el nombre del grupo." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("despacho_grupos_clientes").update({ nombre }).eq("id", id);
    if (error) {
      throw new Error(
        error.code === "23505" ? "Ya existe un grupo con ese nombre." : `Supabase (despacho_grupos_clientes): ${error.message}`
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    // Los miembros se borran solos (on delete cascade).
    const { error } = await supabaseAdmin.from("despacho_grupos_clientes").delete().eq("id", id);
    if (error) throw new Error(`Supabase (despacho_grupos_clientes): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

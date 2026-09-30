import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Sectores");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (typeof body?.nombre === "string") {
      const nombre = body.nombre.trim();
      if (!nombre) return NextResponse.json({ success: false, error: "El nombre no puede quedar vacío." }, { status: 400 });
      updates.nombre = nombre;
    }
    if (typeof body?.activo === "boolean") updates.activo = body.activo;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para actualizar." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("personal_cd_sectores")
      .update(updates)
      .eq("id", id)
      .select("id, nombre, activo, created_at")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505" ? "Ya existe un sector con ese nombre." : `Supabase (personal_cd_sectores): ${error.message}`
      );
    }

    return NextResponse.json({ success: true, sector: data });
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

  const auth = await requireAdminPermission("PCD-Sectores");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;

    const { count, error: errorCount } = await supabaseAdmin
      .from("personal_cd_dotacion")
      .select("id", { count: "exact", head: true })
      .eq("sector_id", id);
    if (errorCount) throw new Error(`Supabase (personal_cd_dotacion): ${errorCount.message}`);
    if (count && count > 0) {
      return NextResponse.json(
        { success: false, error: `No se puede borrar: tiene ${count} empleado(s) asignado(s).` },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("personal_cd_sectores").delete().eq("id", id);
    if (error) throw new Error(`Supabase (personal_cd_sectores): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

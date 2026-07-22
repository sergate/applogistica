import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Perfiles");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : undefined;
    const permisos = Array.isArray(body?.permisos) ? (body.permisos as string[]) : undefined;

    if (nombre) {
      const { error } = await supabaseAdmin.from("perfiles").update({ nombre }).eq("id", id);
      if (error) {
        throw new Error(
          error.code === "23505" ? `Ya existe un perfil llamado "${nombre}".` : `Supabase (perfiles): ${error.message}`
        );
      }
    }

    if (permisos) {
      // Reemplazo total: borramos los permisos actuales y cargamos los nuevos.
      const { error: delError } = await supabaseAdmin.from("perfil_permisos").delete().eq("perfil_id", id);
      if (delError) throw new Error(`Supabase (perfil_permisos - borrado): ${delError.message}`);

      if (permisos.length > 0) {
        const { error: insError } = await supabaseAdmin
          .from("perfil_permisos")
          .insert(permisos.map((key) => ({ perfil_id: id, subseccion_key: key })));
        if (insError) throw new Error(`Supabase (perfil_permisos - insert): ${insError.message}`);
      }
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

  const auth = await requireAdminPermission("ADMIN-Perfiles");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("perfiles").delete().eq("id", id);

    if (error) {
      throw new Error(
        error.code === "23503"
          ? "No se puede borrar: hay usuarios que todavía tienen asignado este perfil."
          : `Supabase (perfiles): ${error.message}`
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

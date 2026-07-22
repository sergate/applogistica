import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Usuarios");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (typeof body?.nombre === "string") updates.nombre = body.nombre.trim();
    if ("perfilId" in body) updates.perfil_id = body.perfilId || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para actualizar." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("usuarios").update(updates).eq("id", id);
    if (error) throw new Error(`Supabase (usuarios): ${error.message}`);

    // Si mandaron una contraseña nueva, la actualizamos en Auth también.
    if (typeof body?.password === "string" && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json({ success: false, error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
      }
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(id, { password: body.password });
      if (pwError) throw new Error(`Supabase Auth: ${pwError.message}`);
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

  const auth = await requireAdminPermission("ADMIN-Usuarios");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;

    // Borra el usuario de Supabase Auth; la fila de "usuarios" se borra sola
    // por el ON DELETE CASCADE hacia auth.users.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw new Error(`Supabase Auth: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

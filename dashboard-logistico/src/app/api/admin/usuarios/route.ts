import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Usuarios");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .select("id, email, nombre, perfil_id, perfiles(nombre)")
      .order("email");

    if (error) throw new Error(`Supabase (usuarios): ${error.message}`);

    const usuarios = (data ?? []).map((u) => {
      const perfilNombre = Array.isArray(u.perfiles)
        ? (u.perfiles[0] as { nombre: string } | undefined)?.nombre
        : (u.perfiles as unknown as { nombre: string } | null)?.nombre;
      return {
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        perfilId: u.perfil_id,
        perfilNombre: perfilNombre || "Sin perfil",
      };
    });

    return NextResponse.json({ success: true, usuarios });
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

  const auth = await requireAdminPermission("ADMIN-Usuarios");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const perfilId = typeof body?.perfilId === "string" ? body.perfilId : null;

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email y contraseña son obligatorios." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ success: false, error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
    }

    // Crea el usuario en Supabase Auth (requiere la Service Role Key).
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message || "No se pudo crear el usuario.");
    }

    const { error: usuarioError } = await supabaseAdmin.from("usuarios").insert({
      id: authData.user.id,
      email,
      nombre: nombre || null,
      perfil_id: perfilId,
    });

    if (usuarioError) {
      // Si falla el insert en "usuarios", limpiamos el usuario de Auth para no dejar huérfanos.
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Supabase (usuarios): ${usuarioError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

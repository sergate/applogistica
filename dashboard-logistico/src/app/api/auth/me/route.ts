import { NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const authClient = await createServerAuthClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autenticado." }, { status: 401 });
    }

    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .select("id, email, nombre, perfil_id, perfiles(nombre)")
      .eq("id", user.id)
      .single();

    if (usuarioError || !usuario) {
      return NextResponse.json(
        { success: false, error: "Tu cuenta no tiene un perfil asignado. Contactá a un administrador." },
        { status: 403 }
      );
    }

    let subsecciones: string[] = [];
    if (usuario.perfil_id) {
      const { data: permisos, error: permisosError } = await supabaseAdmin
        .from("perfil_permisos")
        .select("subseccion_key")
        .eq("perfil_id", usuario.perfil_id);

      if (permisosError) {
        throw new Error(`Supabase (perfil_permisos): ${permisosError.message}`);
      }
      subsecciones = (permisos ?? []).map((p) => p.subseccion_key);
    }

    const perfilNombre = Array.isArray(usuario.perfiles)
      ? (usuario.perfiles[0] as { nombre: string } | undefined)?.nombre
      : (usuario.perfiles as unknown as { nombre: string } | null)?.nombre;

    return NextResponse.json({
      success: true,
      email: usuario.email,
      nombre: usuario.nombre,
      perfil: perfilNombre || "Sin perfil",
      subsecciones,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

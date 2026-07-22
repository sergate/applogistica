import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Perfiles");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data: perfiles, error: perfilesError } = await supabaseAdmin
      .from("perfiles")
      .select("id, nombre, created_at")
      .order("nombre");

    if (perfilesError) throw new Error(`Supabase (perfiles): ${perfilesError.message}`);

    const { data: permisos, error: permisosError } = await supabaseAdmin
      .from("perfil_permisos")
      .select("perfil_id, subseccion_key");

    if (permisosError) throw new Error(`Supabase (perfil_permisos): ${permisosError.message}`);

    const permisosPorPerfil = new Map<string, string[]>();
    for (const p of permisos ?? []) {
      if (!permisosPorPerfil.has(p.perfil_id)) permisosPorPerfil.set(p.perfil_id, []);
      permisosPorPerfil.get(p.perfil_id)!.push(p.subseccion_key);
    }

    const resultado = (perfiles ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      permisos: permisosPorPerfil.get(p.id) ?? [],
    }));

    return NextResponse.json({ success: true, perfiles: resultado });
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

  const auth = await requireAdminPermission("ADMIN-Perfiles");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const permisos = Array.isArray(body?.permisos) ? (body.permisos as string[]) : [];

    if (!nombre) {
      return NextResponse.json({ success: false, error: "El nombre del perfil es obligatorio." }, { status: 400 });
    }

    const { data: nuevoPerfil, error: insertError } = await supabaseAdmin
      .from("perfiles")
      .insert({ nombre })
      .select("id, nombre")
      .single();

    if (insertError) {
      throw new Error(
        insertError.code === "23505"
          ? `Ya existe un perfil llamado "${nombre}".`
          : `Supabase (perfiles): ${insertError.message}`
      );
    }

    if (permisos.length > 0) {
      const { error: permisosError } = await supabaseAdmin
        .from("perfil_permisos")
        .insert(permisos.map((key) => ({ perfil_id: nuevoPerfil.id, subseccion_key: key })));

      if (permisosError) throw new Error(`Supabase (perfil_permisos): ${permisosError.message}`);
    }

    return NextResponse.json({ success: true, perfil: { ...nuevoPerfil, permisos } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

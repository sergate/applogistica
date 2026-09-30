import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista maestra de sectores, solo Admin -- alimenta el combo de Sector en
// Dotación. Devuelve también cuántos empleados tiene cada uno para que el
// frontend pueda bloquear el borrado de un sector en uso.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Sectores");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [{ data: sectores, error: errorSectores }, { data: dotacion, error: errorDotacion }] = await Promise.all([
      supabaseAdmin.from("personal_cd_sectores").select("id, nombre, activo, created_at").order("nombre"),
      supabaseAdmin.from("personal_cd_dotacion").select("sector_id"),
    ]);
    if (errorSectores) throw new Error(`Supabase (personal_cd_sectores): ${errorSectores.message}`);
    if (errorDotacion) throw new Error(`Supabase (personal_cd_dotacion): ${errorDotacion.message}`);

    const empleadosPorSector = new Map<number, number>();
    for (const d of dotacion || []) {
      if (d.sector_id == null) continue;
      empleadosPorSector.set(d.sector_id, (empleadosPorSector.get(d.sector_id) || 0) + 1);
    }

    const resultado = (sectores || []).map((s) => ({
      ...s,
      empleados: empleadosPorSector.get(s.id) || 0,
    }));

    return NextResponse.json({ success: true, sectores: resultado });
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

  const auth = await requireAdminPermission("PCD-Sectores");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) {
      return NextResponse.json({ success: false, error: "Falta el nombre del sector." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("personal_cd_sectores")
      .insert({ nombre })
      .select("id, nombre, activo, created_at")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505" ? "Ya existe un sector con ese nombre." : `Supabase (personal_cd_sectores): ${error.message}`
      );
    }

    return NextResponse.json({ success: true, sector: { ...data, empleados: 0 } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

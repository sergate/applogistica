import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { validarPuestosIds } from "@/lib/personalCupos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOMBRE_MAXIMO = 40;

// Crea una tarjeta de comparación: un nombre (ej. "NTC") y los puestos que compara.
// Son únicas para todos los usuarios; las arma quien tenga PCD-CuposComparar.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-CuposComparar");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ") : "";
    if (!nombre) return NextResponse.json({ success: false, error: "Ponele un nombre a la tarjeta." }, { status: 400 });
    if (nombre.length > NOMBRE_MAXIMO) {
      return NextResponse.json({ success: false, error: `El nombre puede tener hasta ${NOMBRE_MAXIMO} caracteres.` }, { status: 400 });
    }

    const puestos = await validarPuestosIds(body?.puestosIds ?? []);
    if ("error" in puestos) return NextResponse.json({ success: false, error: puestos.error }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("personal_cd_cupos_tarjetas")
      .insert({ nombre, puestos_ids: puestos.ids, creado_por: auth.userId })
      .select("id, nombre, puestos_ids")
      .single();
    if (error) {
      throw new Error(
        error.code === "23505" ? "Ya existe una tarjeta con ese nombre." : `Supabase (personal_cd_cupos_tarjetas): ${error.message}`
      );
    }

    return NextResponse.json({ success: true, tarjeta: { id: data.id, nombre: data.nombre, puestosIds: data.puestos_ids } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

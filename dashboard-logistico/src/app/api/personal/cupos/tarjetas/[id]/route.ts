import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { validarPuestosIds } from "@/lib/personalCupos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOMBRE_MAXIMO = 40;

// Renombra una tarjeta o cambia los puestos que compara.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-CuposComparar");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ success: false, error: "Tarjeta inválida." }, { status: 400 });

    const body = await request.json().catch(() => null);
    const updates: Record<string, unknown> = {};

    if (typeof body?.nombre === "string") {
      const nombre = body.nombre.trim().replace(/\s+/g, " ");
      if (!nombre) return NextResponse.json({ success: false, error: "El nombre no puede quedar vacío." }, { status: 400 });
      if (nombre.length > NOMBRE_MAXIMO) {
        return NextResponse.json({ success: false, error: `El nombre puede tener hasta ${NOMBRE_MAXIMO} caracteres.` }, { status: 400 });
      }
      updates.nombre = nombre;
    }
    if (body && "puestosIds" in body) {
      const puestos = await validarPuestosIds(body.puestosIds);
      if ("error" in puestos) return NextResponse.json({ success: false, error: puestos.error }, { status: 400 });
      updates.puestos_ids = puestos.ids;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para actualizar." }, { status: 400 });
    }
    updates.actualizado_en = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("personal_cd_cupos_tarjetas")
      .update(updates)
      .eq("id", id)
      .select("id, nombre, puestos_ids")
      .maybeSingle();
    if (error) {
      throw new Error(
        error.code === "23505" ? "Ya existe una tarjeta con ese nombre." : `Supabase (personal_cd_cupos_tarjetas): ${error.message}`
      );
    }
    if (!data) return NextResponse.json({ success: false, error: "La tarjeta no existe." }, { status: 404 });

    return NextResponse.json({ success: true, tarjeta: { id: data.id, nombre: data.nombre, puestosIds: data.puestos_ids } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Borra una tarjeta (no toca cupos ni vacaciones).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-CuposComparar");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ success: false, error: "Tarjeta inválida." }, { status: 400 });

    const { error } = await supabaseAdmin.from("personal_cd_cupos_tarjetas").delete().eq("id", id);
    if (error) throw new Error(`Supabase (personal_cd_cupos_tarjetas): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/personalAuditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS_TEXTO: Record<string, string> = {
  legajo: "legajo",
  apellidoNombre: "apellido_nombre",
  dni: "dni",
  fechaNacimiento: "fecha_nacimiento",
  fechaIngreso: "fecha_ingreso",
  puesto: "puesto",
  turno: "turno",
  tipoContrato: "tipo_contrato",
  estado: "estado",
  telefono: "telefono",
  email: "email",
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    for (const [campo, columna] of Object.entries(CAMPOS_TEXTO)) {
      if (campo in body) updates[columna] = body[campo] || null;
    }
    if ("sectorId" in body) updates.sector_id = body.sectorId || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para actualizar." }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    let previo: { legajo: string; apellido_nombre: string; estado: string } | null = null;
    if ("estado" in updates) {
      const { data } = await supabaseAdmin
        .from("personal_cd_dotacion")
        .select("legajo, apellido_nombre, estado")
        .eq("id", id)
        .single();
      previo = data;
    }

    const { error } = await supabaseAdmin.from("personal_cd_dotacion").update(updates).eq("id", id);
    if (error) {
      throw new Error(error.code === "23505" ? "Ya existe un empleado con ese legajo." : `Supabase (personal_cd_dotacion): ${error.message}`);
    }

    if (previo && previo.estado !== updates.estado) {
      await registrarAuditoria({
        usuarioId: auth.userId,
        dotacionId: Number(id),
        legajo: previo.legajo,
        accion: "cambio_estado_dotacion",
        detalle: `${previo.apellido_nombre} (legajo ${previo.legajo}): estado ${previo.estado} -> ${updates.estado}.`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

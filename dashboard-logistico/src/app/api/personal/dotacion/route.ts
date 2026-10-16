import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { calcularAntiguedadAnios } from "@/lib/personalVacaciones";
import { registrarAuditoria } from "@/lib/personalAuditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatAntiguedad(anios: number): string {
  const anosEnteros = Math.floor(anios);
  const meses = Math.round((anios - anosEnteros) * 12);
  const partes: string[] = [];
  if (anosEnteros > 0) partes.push(`${anosEnteros} año${anosEnteros === 1 ? "" : "s"}`);
  if (meses > 0) partes.push(`${meses} mes${meses === 1 ? "" : "es"}`);
  return partes.length > 0 ? partes.join(" ") : "Menos de 1 mes";
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [{ data: dotacion, error: errorDotacion }, { data: sectores, error: errorSectores }] = await Promise.all([
      supabaseAdmin
        .from("personal_cd_dotacion")
        .select("id, legajo, apellido_nombre, dni, fecha_nacimiento, fecha_ingreso, sector_id, puesto, turno, tipo_contrato, estado, telefono, email")
        .order("apellido_nombre"),
      supabaseAdmin.from("personal_cd_sectores").select("id, nombre, activo").order("nombre"),
    ]);
    if (errorDotacion) throw new Error(`Supabase (personal_cd_dotacion): ${errorDotacion.message}`);
    if (errorSectores) throw new Error(`Supabase (personal_cd_sectores): ${errorSectores.message}`);

    const nombrePorSector = new Map((sectores || []).map((s) => [s.id, s.nombre]));
    const hoy = new Date();

    const filas = (dotacion || []).map((d) => ({
      ...d,
      sectorNombre: d.sector_id != null ? nombrePorSector.get(d.sector_id) || null : null,
      antiguedad: formatAntiguedad(calcularAntiguedadAnios(d.fecha_ingreso, hoy)),
    }));

    // Puestos de la lista maestra (se mantiene en Sectores). Si la tabla todavía no
    // existe se ignora el error: Dotación sigue mostrando los puestos en uso.
    const { data: puestosMaestro } = await supabaseAdmin
      .from("personal_cd_puestos")
      .select("nombre")
      .eq("activo", true)
      .order("nombre");

    return NextResponse.json({
      success: true,
      empleados: filas,
      sectores: (sectores || []).filter((s) => s.activo),
      puestos: (puestosMaestro || []).map((p) => p.nombre),
    });
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

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const legajo = typeof body?.legajo === "string" ? body.legajo.trim() : "";
    const apellidoNombre = typeof body?.apellidoNombre === "string" ? body.apellidoNombre.trim() : "";
    const fechaIngreso = typeof body?.fechaIngreso === "string" ? body.fechaIngreso.trim() : "";

    if (!legajo || !apellidoNombre || !fechaIngreso) {
      return NextResponse.json(
        { success: false, error: "Legajo, Apellido y Nombre, y Fecha de Ingreso son obligatorios." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("personal_cd_dotacion")
      .insert({
        legajo,
        apellido_nombre: apellidoNombre,
        dni: body?.dni || null,
        fecha_nacimiento: body?.fechaNacimiento || null,
        fecha_ingreso: fechaIngreso,
        sector_id: body?.sectorId || null,
        puesto: body?.puesto || null,
        turno: body?.turno || null,
        tipo_contrato: body?.tipoContrato || null,
        telefono: body?.telefono || null,
        email: body?.email || null,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.code === "23505" ? "Ya existe un empleado con ese legajo." : `Supabase (personal_cd_dotacion): ${error.message}`);
    }

    await registrarAuditoria({
      usuarioId: auth.userId,
      dotacionId: data.id,
      legajo,
      accion: "alta_dotacion",
      detalle: `Alta de ${apellidoNombre} (legajo ${legajo}).`,
    });

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

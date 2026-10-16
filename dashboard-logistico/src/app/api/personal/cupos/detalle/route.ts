import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { esLunesISO, fetchEmpleadosConUso, SIN_PUESTO_ID } from "@/lib/personalCupos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Quiénes están usando el cupo de un puesto en una semana: legajo, apellido y nombre y
// los días de vacaciones que tienen cargados esa semana. puestoId = 0 es "Sin puesto".
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Cupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const params = request.nextUrl.searchParams;
    const puestoId = Number(params.get("puestoId"));
    const semana = params.get("semana");

    if (!Number.isInteger(puestoId) || puestoId < 0) {
      return NextResponse.json({ success: false, error: "Puesto inválido." }, { status: 400 });
    }
    if (!esLunesISO(semana)) {
      return NextResponse.json({ success: false, error: "La semana tiene que ser la fecha de un lunes." }, { status: 400 });
    }

    const { data: puestos, error } = await supabaseAdmin.from("personal_cd_puestos").select("id, nombre");
    if (error) throw new Error(`Supabase (personal_cd_puestos): ${error.message}`);
    const empleados = await fetchEmpleadosConUso(puestos || []);

    const personas = empleados
      .filter((e) => (puestoId === SIN_PUESTO_ID ? e.puestoId === SIN_PUESTO_ID : e.puestoId === puestoId) && e.cargas.has(semana))
      .map((e) => ({ legajo: e.legajo, apellidoNombre: e.apellidoNombre, dias: e.cargas.get(semana) ?? 0 }))
      .sort((a, b) => a.apellidoNombre.localeCompare(b.apellidoNombre));

    return NextResponse.json({ success: true, personas });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

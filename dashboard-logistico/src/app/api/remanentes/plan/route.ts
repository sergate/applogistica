import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PlanRemanentesRow {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  total_a_procesar: number;
  proceso_inicial: number;
  target: number;
  updated_at: string;
}

// Tanto "Avance Plan" como "Carga Datos" necesitan poder leer el plan
// vigente -- alcanza con tener cualquiera de los dos permisos.
async function requireLecturaPlan() {
  const porAvance = await requireAdminPermission("REM-Avance");
  if (porAvance.autorizado) return porAvance;
  return requireAdminPermission("REM-Carga");
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireLecturaPlan();
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("plan_remanentes")
      .select("id, fecha_inicio, fecha_fin, total_a_procesar, proceso_inicial, target, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(`Supabase (plan_remanentes): ${error.message}`);

    return NextResponse.json({ success: true, plan: (data as PlanRemanentesRow | null) ?? null });
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

  const auth = await requireAdminPermission("REM-Carga");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const fechaInicio = typeof body?.fechaInicio === "string" ? body.fechaInicio.trim() : "";
    const fechaFin = typeof body?.fechaFin === "string" ? body.fechaFin.trim() : "";
    const totalAProcesar = Number(body?.totalAProcesar);
    const procesoInicial = Number(body?.procesoInicial);
    const target = Number(body?.target);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) {
      return NextResponse.json({ success: false, error: "Fechas inválidas (se espera YYYY-MM-DD)." }, { status: 400 });
    }
    if (fechaFin < fechaInicio) {
      return NextResponse.json({ success: false, error: "La fecha fin no puede ser anterior a la fecha inicio." }, { status: 400 });
    }
    if (!Number.isFinite(totalAProcesar) || totalAProcesar < 0) {
      return NextResponse.json({ success: false, error: "Total a procesar inválido." }, { status: 400 });
    }
    if (!Number.isFinite(procesoInicial) || procesoInicial < 0) {
      return NextResponse.json({ success: false, error: "Proceso inicial inválido." }, { status: 400 });
    }
    if (!Number.isFinite(target) || target < 0) {
      return NextResponse.json({ success: false, error: "Target inválido." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("plan_remanentes")
      .upsert(
        {
          id: 1,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          total_a_procesar: totalAProcesar,
          proceso_inicial: procesoInicial,
          target,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, fecha_inicio, fecha_fin, total_a_procesar, proceso_inicial, target, updated_at")
      .single();

    if (error) throw new Error(`Supabase (plan_remanentes): ${error.message}`);

    return NextResponse.json({ success: true, plan: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

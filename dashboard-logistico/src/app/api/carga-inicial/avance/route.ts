import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllProductividad, mapearTipoProceso } from "@/lib/productividadHelpers";
import { diasHabilesEntre, esDiaHabil } from "@/lib/diasHabiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: number | null): number => Number(v) || 0;

interface PlanCargaInicialRow {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  total_a_procesar: number;
  proceso_inicial: number;
  updated_at: string;
}

interface FeriadoRow {
  fecha: string;
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("CI-Avance");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data: planData, error: planError } = await supabaseAdmin
      .from("plan_carga_inicial")
      .select("id, fecha_inicio, fecha_fin, total_a_procesar, proceso_inicial, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (planError) throw new Error(`Supabase (plan_carga_inicial): ${planError.message}`);

    const plan = (planData as PlanCargaInicialRow | null) ?? null;
    if (!plan) {
      return NextResponse.json({ success: true, plan: null, tabla: null, tarjetas: null });
    }

    const { data: feriadosData, error: feriadosError } = await supabaseAdmin
      .from("feriados")
      .select("fecha");
    if (feriadosError) throw new Error(`Supabase (feriados): ${feriadosError.message}`);

    const feriados = new Set((feriadosData as FeriadoRow[] | null ?? []).map((f) => f.fecha));

    const productividadRows = await fetchAllProductividad();
    const cargaInicialPorFecha = new Map<string, number>();
    for (const r of productividadRows) {
      if (mapearTipoProceso(r.tipo_proceso || "") !== "CARGA INICIAL") continue;
      cargaInicialPorFecha.set(r.fecha, (cargaInicialPorFecha.get(r.fecha) ?? 0) + num(r.cantidad));
    }

    const hoyISO = new Date().toISOString().slice(0, 10);

    const totalAProcesar = num(plan.total_a_procesar);
    const procesoInicial = num(plan.proceso_inicial);
    const paraProcesar = totalAProcesar - procesoInicial;

    const diasHabilesPlan = diasHabilesEntre(plan.fecha_inicio, plan.fecha_fin, feriados);
    const necesidadPorDia = diasHabilesPlan > 0 ? paraProcesar / diasHabilesPlan : 0;

    const diasHabilesTranscurridos = diasHabilesEntre(plan.fecha_inicio, hoyISO, feriados);

    // Producción actual: promedio de la carga inicial registrada en los días
    // hábiles YA TRANSCURRIDOS del plan (inicio -> hoy, o inicio -> fin si el
    // plan ya terminó). Si se promediara sobre todo el rango del plan
    // (incluyendo días futuros sin datos todavía) el número queda diluido y
    // deja de reflejar el ritmo real de producción.
    const hastaParaProduccion = hoyISO < plan.fecha_fin ? hoyISO : plan.fecha_fin;
    const diasHabilesTranscurridosParaProduccion = diasHabilesEntre(plan.fecha_inicio, hastaParaProduccion, feriados);
    let sumaProduccionHabil = 0;
    for (const [fecha, cantidad] of cargaInicialPorFecha) {
      if (fecha < plan.fecha_inicio || fecha > hastaParaProduccion) continue;
      if (!esDiaHabil(fecha, feriados)) continue;
      sumaProduccionHabil += cantidad;
    }
    const produccionActual =
      diasHabilesTranscurridosParaProduccion > 0 ? sumaProduccionHabil / diasHabilesTranscurridosParaProduccion : 0;
    const diferencia = necesidadPorDia - produccionActual;

    const avanceIdeal = diasHabilesTranscurridos * necesidadPorDia;

    let avanceReal = 0;
    for (const [fecha, cantidad] of cargaInicialPorFecha) {
      if (fecha < plan.fecha_inicio || fecha > hoyISO) continue;
      avanceReal += cantidad;
    }
    const pctAvance = totalAProcesar > 0 ? (avanceReal / totalAProcesar) * 100 : 0;
    const unidadesPendientes = avanceIdeal - avanceReal;

    return NextResponse.json({
      success: true,
      plan,
      tabla: {
        totalAProcesar,
        procesoInicial,
        paraProcesar,
        diasHabilesPlan,
        necesidadPorDia,
        produccionActual,
        diferencia,
      },
      tarjetas: {
        fechaInicio: plan.fecha_inicio,
        fechaFin: plan.fecha_fin,
        diasHabilesTranscurridos,
        avanceIdeal,
        avanceReal,
        pctAvance,
        unidadesPendientes,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

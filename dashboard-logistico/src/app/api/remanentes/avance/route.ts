import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllProductividad, mapearTipoProceso } from "@/lib/productividadHelpers";
import { diasHabilesEntre, esDiaHabil } from "@/lib/diasHabiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: number | null): number => Number(v) || 0;

interface PlanRemanentesRow {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  total_a_procesar: number;
  proceso_inicial: number;
  target: number;
  updated_at: string;
}

interface FeriadoRow {
  fecha: string;
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("REM-Avance");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data: planData, error: planError } = await supabaseAdmin
      .from("plan_remanentes")
      .select("id, fecha_inicio, fecha_fin, total_a_procesar, proceso_inicial, target, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (planError) throw new Error(`Supabase (plan_remanentes): ${planError.message}`);

    const plan = (planData as PlanRemanentesRow | null) ?? null;
    if (!plan) {
      return NextResponse.json({ success: true, plan: null, tabla: null, tarjetas: null });
    }

    const { data: feriadosData, error: feriadosError } = await supabaseAdmin
      .from("feriados")
      .select("fecha");
    if (feriadosError) throw new Error(`Supabase (feriados): ${feriadosError.message}`);

    const feriados = new Set((feriadosData as FeriadoRow[] | null ?? []).map((f) => f.fecha));

    const productividadRows = await fetchAllProductividad();
    const remanentesPorFecha = new Map<string, number>();
    for (const r of productividadRows) {
      if (mapearTipoProceso(r.tipo_proceso || "") !== "REMANENTES") continue;
      remanentesPorFecha.set(r.fecha, (remanentesPorFecha.get(r.fecha) ?? 0) + num(r.cantidad));
    }

    const hoyISO = new Date().toISOString().slice(0, 10);

    const totalAProcesarInput = num(plan.total_a_procesar);
    const target = num(plan.target);
    const procesoInicial = num(plan.proceso_inicial);
    // El "Total a procesar" de la tabla de detalle no es el valor cargado
    // directo -- se pondera por el Target (%) cargado en Carga Datos.
    const totalAProcesar = totalAProcesarInput * (target / 100);
    const paraProcesar = totalAProcesar - procesoInicial;

    const diasHabilesPlan = diasHabilesEntre(plan.fecha_inicio, plan.fecha_fin, feriados);
    const necesidadPorDia = diasHabilesPlan > 0 ? paraProcesar / diasHabilesPlan : 0;

    const diasHabilesTranscurridos = diasHabilesEntre(plan.fecha_inicio, hoyISO, feriados);

    // Producción actual: promedio de los remanentes registrados en los días
    // hábiles YA TRANSCURRIDOS del plan (inicio -> hoy, o inicio -> fin si el
    // plan ya terminó). Promediar sobre todo el rango del plan (incluyendo
    // días futuros sin datos todavía) diluiría el número.
    const hastaParaProduccion = hoyISO < plan.fecha_fin ? hoyISO : plan.fecha_fin;
    const diasHabilesTranscurridosParaProduccion = diasHabilesEntre(plan.fecha_inicio, hastaParaProduccion, feriados);
    let sumaProduccionHabil = 0;
    for (const [fecha, cantidad] of remanentesPorFecha) {
      if (fecha < plan.fecha_inicio || fecha > hastaParaProduccion) continue;
      if (!esDiaHabil(fecha, feriados)) continue;
      sumaProduccionHabil += cantidad;
    }
    const produccionActual =
      diasHabilesTranscurridosParaProduccion > 0 ? sumaProduccionHabil / diasHabilesTranscurridosParaProduccion : 0;
    const diferencia = necesidadPorDia - produccionActual;

    const avanceIdeal = diasHabilesTranscurridos * necesidadPorDia;

    let avanceReal = 0;
    for (const [fecha, cantidad] of remanentesPorFecha) {
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

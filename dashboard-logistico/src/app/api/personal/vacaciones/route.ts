import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { calcularAntiguedadAnios, calcularVacacionesPorAntiguedad, CICLO_INICIO } from "@/lib/personalVacaciones";
import { CICLO_INICIO_ISO } from "@/lib/personalVacacionesServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Todo el ciclo de vacaciones de los empleados activos/en licencia, con el
// saldo ya calculado -- el trimestre a mostrar lo recorta el frontend
// (misma data sirve para las 5 pestañas, el saldo siempre es del ciclo
// completo, no solo del trimestre que se esté mirando).
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
        .select("id, legajo, apellido_nombre, sector_id, fecha_ingreso, estado")
        .in("estado", ["Activo", "Licencia"])
        .order("apellido_nombre"),
      supabaseAdmin.from("personal_cd_sectores").select("id, nombre"),
    ]);
    if (errorDotacion) throw new Error(`Supabase (personal_cd_dotacion): ${errorDotacion.message}`);
    if (errorSectores) throw new Error(`Supabase (personal_cd_sectores): ${errorSectores.message}`);

    const nombrePorSector = new Map((sectores || []).map((s) => [s.id, s.nombre]));
    const dotacionIds = (dotacion || []).map((d) => d.id);

    const { data: vacaciones, error: errorVacaciones } =
      dotacionIds.length > 0
        ? await supabaseAdmin
            .from("personal_cd_vacaciones")
            .select("id, dotacion_id, vacaciones_adeudadas, vacaciones_actuales_manual")
            .in("dotacion_id", dotacionIds)
            .eq("ciclo_inicio", CICLO_INICIO_ISO)
        : { data: [], error: null };
    if (errorVacaciones) throw new Error(`Supabase (personal_cd_vacaciones): ${errorVacaciones.message}`);

    const vacacionesPorDotacion = new Map((vacaciones || []).map((v) => [v.dotacion_id, v]));
    const vacacionesIds = (vacaciones || []).map((v) => v.id);

    const { data: cargas, error: errorCargas } =
      vacacionesIds.length > 0
        ? await supabaseAdmin
            .from("personal_cd_vacaciones_cargas")
            .select("vacaciones_id, semana_inicio, dias")
            .in("vacaciones_id", vacacionesIds)
        : { data: [], error: null };
    if (errorCargas) throw new Error(`Supabase (personal_cd_vacaciones_cargas): ${errorCargas.message}`);

    const cargasPorVacaciones = new Map<number, { semanaInicio: string; dias: number }[]>();
    for (const c of cargas || []) {
      if (!cargasPorVacaciones.has(c.vacaciones_id)) cargasPorVacaciones.set(c.vacaciones_id, []);
      cargasPorVacaciones.get(c.vacaciones_id)!.push({ semanaInicio: c.semana_inicio, dias: Number(c.dias) });
    }

    const empleados = (dotacion || []).map((d) => {
      const v = vacacionesPorDotacion.get(d.id);
      const actualesCalculado = calcularVacacionesPorAntiguedad(calcularAntiguedadAnios(d.fecha_ingreso, CICLO_INICIO));
      const actualesManual = v?.vacaciones_actuales_manual != null ? Number(v.vacaciones_actuales_manual) : null;
      const actualesFinal = actualesManual != null ? actualesManual : actualesCalculado;
      const adeudadas = v ? Number(v.vacaciones_adeudadas) : 0;
      const listaCargas = v ? cargasPorVacaciones.get(v.id) || [] : [];
      const totalCargado = listaCargas.reduce((acc, c) => acc + c.dias, 0);

      const cargasMap: Record<string, number> = {};
      for (const c of listaCargas) cargasMap[c.semanaInicio] = c.dias;

      return {
        id: d.id,
        legajo: d.legajo,
        apellidoNombre: d.apellido_nombre,
        sector: d.sector_id != null ? nombrePorSector.get(d.sector_id) || null : null,
        adeudadas,
        actualesCalculado,
        actualesManual,
        actualesFinal,
        saldo: adeudadas + actualesFinal - totalCargado,
        cargas: cargasMap,
      };
    });

    return NextResponse.json({ success: true, empleados });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

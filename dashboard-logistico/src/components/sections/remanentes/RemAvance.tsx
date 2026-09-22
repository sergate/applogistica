"use client";

import { useEffect, useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtSoloFecha } from "@/components/dashboard/formatters";
import type { PlanRemanentes, REMDetalleFila } from "./types";

interface AvancePlanTabla {
  totalAProcesar: number;
  procesoInicial: number;
  paraProcesar: number;
  diasHabilesPlan: number;
  necesidadPorDia: number;
  produccionActual: number;
  diferencia: number;
}
interface AvancePlanTarjetas {
  fechaInicio: string;
  fechaFin: string;
  diasHabilesTranscurridos: number;
  avanceIdeal: number;
  avanceReal: number;
  pctAvance: number;
  unidadesPendientes: number;
}

export default function RemAvance() {
  const { activeTab, dataVersion, irA } = useDashboard();

  // remDetalleData comparte la misma clave de cache "REM-Resumen" que usa
  // RemResumen, para no volver a pedir /api/remanentes/detalle si ya se
  // visitó esa pestaña (SWR cachea por clave, no por componente).
  const {
    data: remDetalleData,
    isLoading: remDetalleLoading,
  } = useTabData<{ filas: REMDetalleFila[]; updatedAt: string | null }>(
    "REM-Resumen",
    "REM-Resumen",
    "/api/remanentes/detalle",
    dataVersion
  );

  // --- Plan de remanentes (target %, también usado en Carga Datos) ---
  const [planRemanentes, setPlanRemanentes] = useState<PlanRemanentes | null>(null);

  useEffect(() => {
    if (activeTab !== "REM-Avance") return;
    let cancelado = false;
    async function cargarPlan() {
      try {
        const res = await fetch("/api/remanentes/plan", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.success && !cancelado) setPlanRemanentes(data.plan);
      } catch {
        // El % Target simplemente queda en 0 si esto falla.
      }
    }
    cargarPlan();
    return () => {
      cancelado = true;
    };
  }, [activeTab, dataVersion]);

  // --- Avance del plan (tabla + tarjetas) ---
  const [avancePlanRemData, setAvancePlanRemData] = useState<{
    plan: PlanRemanentes | null;
    tabla: AvancePlanTabla | null;
    tarjetas: AvancePlanTarjetas | null;
  } | null>(null);
  const [avancePlanRemLoading, setAvancePlanRemLoading] = useState(false);
  const [avancePlanRemError, setAvancePlanRemError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "REM-Avance") return;
    let cancelado = false;

    async function cargarAvancePlanRem() {
      setAvancePlanRemLoading(true);
      setAvancePlanRemError(null);
      try {
        const res = await fetch("/api/remanentes/avance", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el avance del plan.");
        if (!cancelado) setAvancePlanRemData({ plan: data.plan, tabla: data.tabla, tarjetas: data.tarjetas });
      } catch (err) {
        if (!cancelado) setAvancePlanRemError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setAvancePlanRemLoading(false);
      }
    }

    cargarAvancePlanRem();
    return () => {
      cancelado = true;
    };
  }, [activeTab, dataVersion]);

  // --- Resumen por Marca / Grupo (con Unidades Target) ---
  const [filtroMarcaResumenREM, setFiltroMarcaResumenREM] = useState("TODAS");
  const [filtroGrupoResumenREM, setFiltroGrupoResumenREM] = useState("TODAS");

  const targetPctREM = planRemanentes ? planRemanentes.target : 0;

  const marcasDisponiblesREM = Array.from(new Set((remDetalleData?.filas ?? []).map((f) => f.marca))).sort();
  const gruposDisponiblesREM = Array.from(new Set((remDetalleData?.filas ?? []).map((f) => f.grupo))).sort();

  const { filasTablaResumenMarcaGrupoREM, subtotalResumenMarcaGrupoREMCalculado } = useMemo(() => {
    const filasFiltradasResumenREM = (remDetalleData?.filas ?? []).filter(
      (f) =>
        (filtroMarcaResumenREM === "TODAS" || f.marca === filtroMarcaResumenREM) &&
        (filtroGrupoResumenREM === "TODAS" || f.grupo === filtroGrupoResumenREM)
    );

    // Consolidamos por (marca, grupo) sumando todos los archivos/temporadas
    const consolidadoMarcaGrupoREM = new Map<
      string,
      { marca: string; grupo: string; pedidas: number; distribuidas: number; aRepartir: number }
    >();
    for (const f of filasFiltradasResumenREM) {
      const key = `${f.marca}__${f.grupo}`;
      if (!consolidadoMarcaGrupoREM.has(key)) {
        consolidadoMarcaGrupoREM.set(key, { marca: f.marca, grupo: f.grupo, pedidas: 0, distribuidas: 0, aRepartir: 0 });
      }
      const acc = consolidadoMarcaGrupoREM.get(key)!;
      acc.pedidas += f.pedidas;
      acc.distribuidas += f.distribuidas;
      acc.aRepartir += f.aRepartir;
    }

    const filasTablaResumenMarcaGrupoREM = Array.from(consolidadoMarcaGrupoREM.values())
      .map((acc) => {
        const unidadesTarget = acc.pedidas * (targetPctREM / 100);
        return {
          ...acc,
          unidadesTarget,
          pctAvance: unidadesTarget > 0 ? (acc.distribuidas / unidadesTarget) * 100 : 0,
        };
      })
      .sort((a, b) => (a.marca !== b.marca ? a.marca.localeCompare(b.marca) : a.grupo.localeCompare(b.grupo)));

    const subtotalResumenMarcaGrupoREM = filasFiltradasResumenREM.reduce(
      (acc, f) => ({
        pedidas: acc.pedidas + f.pedidas,
        distribuidas: acc.distribuidas + f.distribuidas,
        aRepartir: acc.aRepartir + f.aRepartir,
      }),
      { pedidas: 0, distribuidas: 0, aRepartir: 0 }
    );
    const unidadesTargetSubtotal = subtotalResumenMarcaGrupoREM.pedidas * (targetPctREM / 100);
    const subtotalResumenMarcaGrupoREMCalculado = {
      ...subtotalResumenMarcaGrupoREM,
      unidadesTarget: unidadesTargetSubtotal,
      pctAvance: unidadesTargetSubtotal > 0 ? (subtotalResumenMarcaGrupoREM.distribuidas / unidadesTargetSubtotal) * 100 : 0,
    };

    return { filasTablaResumenMarcaGrupoREM, subtotalResumenMarcaGrupoREMCalculado };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remDetalleData, filtroMarcaResumenREM, filtroGrupoResumenREM, targetPctREM]);

  return (
    <div className="space-y-6">
      {avancePlanRemError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar el avance del plan: {avancePlanRemError}
        </div>
      )}
      {avancePlanRemLoading && !avancePlanRemData && (
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
          Cargando avance del plan...
        </div>
      )}

      {!avancePlanRemLoading && avancePlanRemData && !avancePlanRemData.plan && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-2xl text-center">
          <p className="text-sm text-slate-500 mb-4">
            Todavía no se cargó el plan de remanentes. Cargalo en la subsección &quot;Carga Datos&quot; para ver el avance acá.
          </p>
          <button
            onClick={() => irA("REM-Carga")}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Ir a Carga Datos
          </button>
        </div>
      )}

      {avancePlanRemData?.plan && avancePlanRemData.tabla && avancePlanRemData.tarjetas && (
        <>
          {/* --- TABLA: DETALLE DEL PLAN --- */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Detalle del plan</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead>
                  <tr className="text-slate-500 font-medium border-b border-slate-200">
                    <th className="py-3 px-4 text-left">
                      Total a procesar al {fmtSoloFecha(avancePlanRemData.tarjetas.fechaFin)}
                    </th>
                    <th className="py-3 px-4 text-left">Proceso inicial</th>
                    <th className="py-3 px-4 text-left">
                      Para procesar a partir del {fmtSoloFecha(avancePlanRemData.tarjetas.fechaInicio)}
                    </th>
                    <th className="py-3 px-4 text-left">Días hábiles¹</th>
                    <th className="py-3 px-4 text-left">Necesidad por día²</th>
                    <th className="py-3 px-4 text-left">Producción actual³</th>
                    <th className="py-3 px-4 text-left">Diferencia⁴</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-4 text-left font-semibold text-slate-900">{fmtNum(avancePlanRemData.tabla.totalAProcesar)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.procesoInicial)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.paraProcesar)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.diasHabilesPlan)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.necesidadPorDia)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanRemData.tabla.produccionActual)}</td>
                    <td
                      className={`py-3 px-4 text-left font-semibold ${
                        avancePlanRemData.tabla.diferencia >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {fmtNum(avancePlanRemData.tabla.diferencia)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-1 text-xs text-slate-400">
              <p>¹ Días hábiles entre la fecha inicio y la fecha fin de plan.</p>
              <p>² Para procesar a partir del inicio de plan / Días hábiles.</p>
              <p>
                ³ Promedio de los datos de remanentes del reporte de producción por proceso, desde la fecha inicio de plan hasta
                hoy (o hasta la fecha fin de plan si ya finalizó). Solo se promedia sobre los días hábiles ya transcurridos; los
                datos cargados en un día no hábil no se consideran para este cálculo.
              </p>
              <p>⁴ Diferencia entre la necesidad por día y la producción actual.</p>
              <p>
                El &quot;Total a procesar&quot; es la suma de Unidades Target (Unidades Pedidas x Target %) de todas las
                marcas y grupos cargados en Remanentes (ver subsección Resumen).
              </p>
            </div>
          </div>

          {/* --- TARJETAS DE SEGUIMIENTO --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Fecha inicio / fin de plan</p>
              <p className="text-lg font-bold text-slate-800">
                {fmtSoloFecha(avancePlanRemData.tarjetas.fechaInicio)} — {fmtSoloFecha(avancePlanRemData.tarjetas.fechaFin)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Días hábiles transcurridos</p>
              <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanRemData.tarjetas.diasHabilesTranscurridos)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Avance ideal</p>
              <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanRemData.tarjetas.avanceIdeal)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Avance real</p>
              <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanRemData.tarjetas.avanceReal)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">% Avance real</p>
              <p className="text-2xl font-bold text-blue-600">{fmtPct(avancePlanRemData.tarjetas.pctAvance)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Unidades pendientes</p>
              <p
                className={`text-2xl font-bold ${
                  avancePlanRemData.tarjetas.unidadesPendientes > 0 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {fmtNum(avancePlanRemData.tarjetas.unidadesPendientes)}
              </p>
            </div>
          </div>

          {/* --- TABLA DE RESUMEN POR MARCA / GRUPO (con Unidades Target) --- */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Resumen por Marca / Grupo</h2>
            <p className="text-sm text-slate-500 mb-4">
              Unidades Target = Unidades Pedidas x Target ({fmtPct(targetPctREM)}) cargado en Carga Datos.
            </p>

            {/* FILTROS */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <select
                value={filtroMarcaResumenREM}
                onChange={(e) => setFiltroMarcaResumenREM(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="TODAS">Todas las marcas</option>
                {marcasDisponiblesREM.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <select
                value={filtroGrupoResumenREM}
                onChange={(e) => setFiltroGrupoResumenREM(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="TODAS">Todos los grupos</option>
                {gruposDisponiblesREM.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  setFiltroMarcaResumenREM("TODAS");
                  setFiltroGrupoResumenREM("TODAS");
                }}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Limpiar filtros
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead>
                  {filasTablaResumenMarcaGrupoREM.length > 0 && (
                    <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                      <td className="py-3 px-4 text-left" colSpan={2}>
                        Subtotal
                        {filtroMarcaResumenREM !== "TODAS" ? ` — ${filtroMarcaResumenREM}` : " — Todas las marcas"}
                        {filtroGrupoResumenREM !== "TODAS" ? ` — ${filtroGrupoResumenREM}` : ""}
                      </td>
                      <td className="py-3 px-4 text-left">{fmtNum(subtotalResumenMarcaGrupoREMCalculado.pedidas)}</td>
                      <td className="py-3 px-4 text-left">{fmtNum(subtotalResumenMarcaGrupoREMCalculado.unidadesTarget)}</td>
                      <td className="py-3 px-4 text-left">{fmtNum(subtotalResumenMarcaGrupoREMCalculado.distribuidas)}</td>
                      <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(subtotalResumenMarcaGrupoREMCalculado.aRepartir)}</td>
                      <td className="py-3 px-4 text-left">{fmtPct(subtotalResumenMarcaGrupoREMCalculado.pctAvance)}</td>
                    </tr>
                  )}
                  <tr className="text-slate-500 font-medium border-b border-slate-200">
                    <th className="py-3 px-4 text-left">Marca</th>
                    <th className="py-3 px-4 text-left">Grupo</th>
                    <th className="py-3 px-4 text-left">Unidades Pedidas</th>
                    <th className="py-3 px-4 text-left">Unidades Target</th>
                    <th className="py-3 px-4 text-left">Unidades Distribuidas</th>
                    <th className="py-3 px-4 text-left">Unidades a Repartir</th>
                    <th className="py-3 px-4 text-left">% Avance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filasTablaResumenMarcaGrupoREM.map((row, i) => (
                    <tr key={`${row.marca}-${row.grupo}-${i}`} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-left font-bold text-slate-900">{row.marca}</td>
                      <td className="py-3 px-4 text-left text-slate-600">{row.grupo}</td>
                      <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.pedidas)}</td>
                      <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.unidadesTarget)}</td>
                      <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.distribuidas)}</td>
                      <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(row.aRepartir)}</td>
                      <td className="py-3 px-4 text-left text-slate-600">{fmtPct(row.pctAvance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filasTablaResumenMarcaGrupoREM.length === 0 && !remDetalleLoading && (
                <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

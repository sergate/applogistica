"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtSoloFecha } from "@/components/dashboard/formatters";
import type { PlanCargaInicial } from "./types";

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

export default function CIAvance() {
  const { activeTab, dataVersion, irA } = useDashboard();

  const [avancePlanData, setAvancePlanData] = useState<{
    plan: PlanCargaInicial | null;
    tabla: AvancePlanTabla | null;
    tarjetas: AvancePlanTarjetas | null;
  } | null>(null);
  const [avancePlanLoading, setAvancePlanLoading] = useState(false);
  const [avancePlanError, setAvancePlanError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "CI-Avance") return;
    let cancelado = false;

    async function cargarAvancePlan() {
      setAvancePlanLoading(true);
      setAvancePlanError(null);
      try {
        const res = await fetch("/api/carga-inicial/avance", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el avance del plan.");
        if (!cancelado) setAvancePlanData({ plan: data.plan, tabla: data.tabla, tarjetas: data.tarjetas });
      } catch (err) {
        if (!cancelado) setAvancePlanError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setAvancePlanLoading(false);
      }
    }

    cargarAvancePlan();
    return () => {
      cancelado = true;
    };
  }, [activeTab, dataVersion]);

  return (
    <div className="space-y-6">
      {avancePlanError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar el avance del plan: {avancePlanError}
        </div>
      )}
      {avancePlanLoading && !avancePlanData && (
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
          Cargando avance del plan...
        </div>
      )}

      {!avancePlanLoading && avancePlanData && !avancePlanData.plan && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-2xl text-center">
          <p className="text-sm text-slate-500 mb-4">
            Todavía no se cargó el plan de carga inicial. Cargalo en la subsección &quot;Carga Datos&quot; para ver el avance acá.
          </p>
          <button
            onClick={() => irA("CI-Carga")}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Ir a Carga Datos
          </button>
        </div>
      )}

      {avancePlanData?.plan && avancePlanData.tabla && avancePlanData.tarjetas && (
        <>
          {/* --- TABLA: DETALLE DEL PLAN --- */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Detalle del plan</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead>
                  <tr className="text-slate-500 font-medium border-b border-slate-200">
                    <th className="py-3 px-4 text-left">
                      Total a procesar al {fmtSoloFecha(avancePlanData.tarjetas.fechaFin)}
                    </th>
                    <th className="py-3 px-4 text-left">Proceso inicial</th>
                    <th className="py-3 px-4 text-left">
                      Para procesar a partir del {fmtSoloFecha(avancePlanData.tarjetas.fechaInicio)}
                    </th>
                    <th className="py-3 px-4 text-left">Días hábiles¹</th>
                    <th className="py-3 px-4 text-left">Necesidad por día²</th>
                    <th className="py-3 px-4 text-left">Producción actual³</th>
                    <th className="py-3 px-4 text-left">Diferencia⁴</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-4 text-left font-semibold text-slate-900">{fmtNum(avancePlanData.tabla.totalAProcesar)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.procesoInicial)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.paraProcesar)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.diasHabilesPlan)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.necesidadPorDia)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(avancePlanData.tabla.produccionActual)}</td>
                    <td
                      className={`py-3 px-4 text-left font-semibold ${
                        avancePlanData.tabla.diferencia >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {fmtNum(avancePlanData.tabla.diferencia)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-1 text-xs text-slate-400">
              <p>¹ Días hábiles entre la fecha inicio y la fecha fin de plan.</p>
              <p>² Para procesar a partir del inicio de plan / Días hábiles.</p>
              <p>
                ³ Promedio de los datos de carga inicial del reporte de producción por proceso, desde la fecha inicio de plan
                hasta hoy (o hasta la fecha fin de plan si ya finalizó). Solo se promedia sobre los días hábiles ya
                transcurridos; los datos cargados en un día no hábil no se consideran para este cálculo.
              </p>
              <p>⁴ Diferencia entre la necesidad por día y la producción actual.</p>
            </div>
          </div>

          {/* --- TARJETAS DE SEGUIMIENTO --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Fecha inicio / fin de plan</p>
              <p className="text-lg font-bold text-slate-800">
                {fmtSoloFecha(avancePlanData.tarjetas.fechaInicio)} — {fmtSoloFecha(avancePlanData.tarjetas.fechaFin)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Días hábiles transcurridos</p>
              <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanData.tarjetas.diasHabilesTranscurridos)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Avance ideal</p>
              <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanData.tarjetas.avanceIdeal)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Avance real</p>
              <p className="text-2xl font-bold text-slate-800">{fmtNum(avancePlanData.tarjetas.avanceReal)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">% Avance real</p>
              <p className="text-2xl font-bold text-blue-600">{fmtPct(avancePlanData.tarjetas.pctAvance)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-400 mb-2">Unidades pendientes</p>
              <p
                className={`text-2xl font-bold ${
                  avancePlanData.tarjetas.unidadesPendientes > 0 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {fmtNum(avancePlanData.tarjetas.unidadesPendientes)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

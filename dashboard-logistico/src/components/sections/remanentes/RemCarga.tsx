"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtSoloFecha } from "@/components/dashboard/formatters";
import type { PlanRemanentes } from "./types";

export default function RemCarga() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const [planRemanentes, setPlanRemanentes] = useState<PlanRemanentes | null>(null);
  const [planRemanentesLoading, setPlanRemanentesLoading] = useState(false);
  const [planRemanentesError, setPlanRemanentesError] = useState<string | null>(null);
  const [editandoPlanRemanentes, setEditandoPlanRemanentes] = useState(false);
  const [guardandoPlanRemanentes, setGuardandoPlanRemanentes] = useState(false);
  const [formPlanRemFechaInicio, setFormPlanRemFechaInicio] = useState("");
  const [formPlanRemFechaFin, setFormPlanRemFechaFin] = useState("");
  const [formPlanRemProcesoInicial, setFormPlanRemProcesoInicial] = useState("");
  const [formPlanRemTarget, setFormPlanRemTarget] = useState("");

  const cargarPlanRemanentes = async () => {
    setPlanRemanentesLoading(true);
    setPlanRemanentesError(null);
    try {
      const res = await fetch("/api/remanentes/plan", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el plan.");
      setPlanRemanentes(data.plan);
      if (data.plan) {
        setFormPlanRemFechaInicio(data.plan.fecha_inicio);
        setFormPlanRemFechaFin(data.plan.fecha_fin);
        setFormPlanRemProcesoInicial(String(data.plan.proceso_inicial));
        setFormPlanRemTarget(String(data.plan.target));
      }
    } catch (err) {
      setPlanRemanentesError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPlanRemanentesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "REM-Carga") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPlanRemanentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  const planRemanentesFormValido =
    !!formPlanRemFechaInicio &&
    !!formPlanRemFechaFin &&
    formPlanRemFechaFin >= formPlanRemFechaInicio &&
    formPlanRemProcesoInicial !== "" &&
    Number.isFinite(Number(formPlanRemProcesoInicial)) &&
    Number(formPlanRemProcesoInicial) >= 0 &&
    formPlanRemTarget !== "" &&
    Number.isFinite(Number(formPlanRemTarget)) &&
    Number(formPlanRemTarget) >= 0;

  const guardarPlanRemanentes = async () => {
    if (!planRemanentesFormValido) return;
    setGuardandoPlanRemanentes(true);
    setPlanRemanentesError(null);
    try {
      const res = await fetch("/api/remanentes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaInicio: formPlanRemFechaInicio,
          fechaFin: formPlanRemFechaFin,
          procesoInicial: Number(formPlanRemProcesoInicial),
          target: Number(formPlanRemTarget),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar el plan.");
      setPlanRemanentes(data.plan);
      setEditandoPlanRemanentes(false);
      setDataVersion((v) => v + 1); // refresca también el cálculo de Avance Plan
    } catch (err) {
      setPlanRemanentesError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoPlanRemanentes(false);
    }
  };

  const cancelarEdicionPlanRemanentes = () => {
    setEditandoPlanRemanentes(false);
    setPlanRemanentesError(null);
    if (planRemanentes) {
      setFormPlanRemFechaInicio(planRemanentes.fecha_inicio);
      setFormPlanRemFechaFin(planRemanentes.fecha_fin);
      setFormPlanRemProcesoInicial(String(planRemanentes.proceso_inicial));
      setFormPlanRemTarget(String(planRemanentes.target));
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-2xl">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Carga Datos — Plan de Remanentes</h2>
      <p className="text-sm text-slate-500 mb-6">
        Estos datos alimentan el cálculo de la subsección &quot;Avance Plan&quot;. El &quot;Total a procesar&quot; ya no se
        carga a mano: se calcula automáticamente en base a los datos de la subsección &quot;Resumen&quot; (Unidades Pedidas x
        Target de cada marca y grupo).
      </p>

      {planRemanentesError && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{planRemanentesError}</div>
      )}
      {planRemanentesLoading && !planRemanentes && (
        <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">Cargando plan...</div>
      )}

      {(!planRemanentes || editandoPlanRemanentes) ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Fecha inicio de plan</label>
            <input
              type="date"
              value={formPlanRemFechaInicio}
              onChange={(e) => setFormPlanRemFechaInicio(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Fecha fin de plan</label>
            <input
              type="date"
              value={formPlanRemFechaFin}
              onChange={(e) => setFormPlanRemFechaFin(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Target (%)</label>
            <input
              type="number"
              min={0}
              value={formPlanRemTarget}
              onChange={(e) => setFormPlanRemTarget(e.target.value)}
              placeholder="Ej: 85"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Proceso inicial</label>
            <input
              type="number"
              min={0}
              value={formPlanRemProcesoInicial}
              onChange={(e) => setFormPlanRemProcesoInicial(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={guardarPlanRemanentes}
              disabled={!planRemanentesFormValido || guardandoPlanRemanentes}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                !planRemanentesFormValido || guardandoPlanRemanentes
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {guardandoPlanRemanentes ? "Guardando..." : "Confirmar datos"}
            </button>
            {planRemanentes && (
              <button
                onClick={cancelarEdicionPlanRemanentes}
                disabled={guardandoPlanRemanentes}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <dt className="text-xs font-medium text-slate-400 mb-1">Fecha inicio de plan</dt>
              <dd className="text-sm font-semibold text-slate-800">{fmtSoloFecha(planRemanentes.fecha_inicio)}</dd>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <dt className="text-xs font-medium text-slate-400 mb-1">Fecha fin de plan</dt>
              <dd className="text-sm font-semibold text-slate-800">{fmtSoloFecha(planRemanentes.fecha_fin)}</dd>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <dt className="text-xs font-medium text-slate-400 mb-1">Target</dt>
              <dd className="text-sm font-semibold text-slate-800">{fmtPct(planRemanentes.target)}</dd>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <dt className="text-xs font-medium text-slate-400 mb-1">Proceso inicial</dt>
              <dd className="text-sm font-semibold text-slate-800">{fmtNum(planRemanentes.proceso_inicial)}</dd>
            </div>
          </dl>
          <button
            onClick={() => setEditandoPlanRemanentes(true)}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Modificar
          </button>
        </div>
      )}
    </div>
  );
}

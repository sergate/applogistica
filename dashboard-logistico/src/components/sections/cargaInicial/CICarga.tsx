"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtSoloFecha } from "@/components/dashboard/formatters";
import type { PlanCargaInicial } from "./types";

export default function CICarga() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const [planCargaInicial, setPlanCargaInicial] = useState<PlanCargaInicial | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [editandoPlan, setEditandoPlan] = useState(false);
  const [guardandoPlan, setGuardandoPlan] = useState(false);
  const [formPlanFechaInicio, setFormPlanFechaInicio] = useState("");
  const [formPlanFechaFin, setFormPlanFechaFin] = useState("");
  const [formPlanTotalAProcesar, setFormPlanTotalAProcesar] = useState("");
  const [formPlanProcesoInicial, setFormPlanProcesoInicial] = useState("");

  const cargarPlanCargaInicial = async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/carga-inicial/plan", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el plan.");
      setPlanCargaInicial(data.plan);
      if (data.plan) {
        setFormPlanFechaInicio(data.plan.fecha_inicio);
        setFormPlanFechaFin(data.plan.fecha_fin);
        setFormPlanTotalAProcesar(String(data.plan.total_a_procesar));
        setFormPlanProcesoInicial(String(data.plan.proceso_inicial));
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "CI-Carga") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPlanCargaInicial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  const planFormValido =
    !!formPlanFechaInicio &&
    !!formPlanFechaFin &&
    formPlanFechaFin >= formPlanFechaInicio &&
    formPlanTotalAProcesar !== "" &&
    Number.isFinite(Number(formPlanTotalAProcesar)) &&
    Number(formPlanTotalAProcesar) >= 0 &&
    formPlanProcesoInicial !== "" &&
    Number.isFinite(Number(formPlanProcesoInicial)) &&
    Number(formPlanProcesoInicial) >= 0;

  const guardarPlanCargaInicial = async () => {
    if (!planFormValido) return;
    setGuardandoPlan(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/carga-inicial/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaInicio: formPlanFechaInicio,
          fechaFin: formPlanFechaFin,
          totalAProcesar: Number(formPlanTotalAProcesar),
          procesoInicial: Number(formPlanProcesoInicial),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar el plan.");
      setPlanCargaInicial(data.plan);
      setEditandoPlan(false);
      setDataVersion((v) => v + 1); // refresca también el cálculo de Avance Plan
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoPlan(false);
    }
  };

  const cancelarEdicionPlan = () => {
    setEditandoPlan(false);
    setPlanError(null);
    if (planCargaInicial) {
      setFormPlanFechaInicio(planCargaInicial.fecha_inicio);
      setFormPlanFechaFin(planCargaInicial.fecha_fin);
      setFormPlanTotalAProcesar(String(planCargaInicial.total_a_procesar));
      setFormPlanProcesoInicial(String(planCargaInicial.proceso_inicial));
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-2xl">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Carga Datos — Plan de Carga Inicial</h2>
      <p className="text-sm text-slate-500 mb-6">
        Estos datos alimentan el cálculo de la subsección &quot;Avance Plan&quot;.
      </p>

      {planError && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{planError}</div>
      )}
      {planLoading && !planCargaInicial && (
        <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">Cargando plan...</div>
      )}

      {(!planCargaInicial || editandoPlan) ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Fecha inicio de plan</label>
            <input
              type="date"
              value={formPlanFechaInicio}
              onChange={(e) => setFormPlanFechaInicio(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Fecha fin de plan</label>
            <input
              type="date"
              value={formPlanFechaFin}
              onChange={(e) => setFormPlanFechaFin(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Total a procesar</label>
            <input
              type="number"
              min={0}
              value={formPlanTotalAProcesar}
              onChange={(e) => setFormPlanTotalAProcesar(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Proceso inicial</label>
            <input
              type="number"
              min={0}
              value={formPlanProcesoInicial}
              onChange={(e) => setFormPlanProcesoInicial(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={guardarPlanCargaInicial}
              disabled={!planFormValido || guardandoPlan}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                !planFormValido || guardandoPlan
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {guardandoPlan ? "Guardando..." : "Confirmar datos"}
            </button>
            {planCargaInicial && (
              <button
                onClick={cancelarEdicionPlan}
                disabled={guardandoPlan}
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
              <dd className="text-sm font-semibold text-slate-800">{fmtSoloFecha(planCargaInicial.fecha_inicio)}</dd>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <dt className="text-xs font-medium text-slate-400 mb-1">Fecha fin de plan</dt>
              <dd className="text-sm font-semibold text-slate-800">{fmtSoloFecha(planCargaInicial.fecha_fin)}</dd>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <dt className="text-xs font-medium text-slate-400 mb-1">Total a procesar</dt>
              <dd className="text-sm font-semibold text-slate-800">{fmtNum(planCargaInicial.total_a_procesar)}</dd>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <dt className="text-xs font-medium text-slate-400 mb-1">Proceso inicial</dt>
              <dd className="text-sm font-semibold text-slate-800">{fmtNum(planCargaInicial.proceso_inicial)}</dd>
            </div>
          </dl>
          <button
            onClick={() => setEditandoPlan(true)}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Modificar
          </button>
        </div>
      )}
    </div>
  );
}

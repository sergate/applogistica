"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtFecha, fmtNum, fmtPct, fmtSoloFecha } from "@/components/dashboard/formatters";
import type { PlanRemanentes } from "./types";

interface ArchivoManual {
  id: number;
  archivo: string;
  nota: string | null;
  created_at: string;
}

export default function RemCarga() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const [archivosManuales, setArchivosManuales] = useState<ArchivoManual[]>([]);
  const [archivosManualesLoading, setArchivosManualesLoading] = useState(false);
  const [archivosManualesError, setArchivosManualesError] = useState<string | null>(null);
  const [formArchivosTexto, setFormArchivosTexto] = useState("");
  const [formArchivosNota, setFormArchivosNota] = useState("");
  const [agregandoArchivos, setAgregandoArchivos] = useState(false);

  const cargarArchivosManuales = async () => {
    setArchivosManualesLoading(true);
    setArchivosManualesError(null);
    try {
      const res = await fetch("/api/remanentes/archivos-manuales", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los archivos.");
      setArchivosManuales(data.archivos);
    } catch (err) {
      setArchivosManualesError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setArchivosManualesLoading(false);
    }
  };

  const agregarArchivosManuales = async () => {
    // Los nombres de archivo llevan espacios ("CI- 1 CQ REMA VER ..."), así
    // que se separan solo por salto de línea (a diferencia de los pedidos).
    const archivos = Array.from(new Set(formArchivosTexto.split(/\r?\n/).map((a) => a.trim()).filter(Boolean)));
    if (archivos.length === 0) return;
    setAgregandoArchivos(true);
    setArchivosManualesError(null);
    try {
      const res = await fetch("/api/remanentes/archivos-manuales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivos, nota: formArchivosNota.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron agregar los archivos.");
      setFormArchivosTexto("");
      setFormArchivosNota("");
      await cargarArchivosManuales();
      setDataVersion((v) => v + 1); // refresca Resumen y Avance Plan
    } catch (err) {
      setArchivosManualesError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoArchivos(false);
    }
  };

  const eliminarArchivoManual = async (id: number, archivo: string) => {
    if (!confirm(`¿Seguro que querés sacar "${archivo}" de la lista? Ya no se va a descargar con Remanentes y, si no lleva REMA en el nombre, deja de contar como remanente. Los datos ya importados no se borran.`)) return;
    setArchivosManualesError(null);
    try {
      const res = await fetch("/api/remanentes/archivos-manuales", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el archivo.");
      await cargarArchivosManuales();
      setDataVersion((v) => v + 1);
    } catch (err) {
      setArchivosManualesError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

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
    cargarArchivosManuales();
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
    <div className="space-y-6">
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

    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-3xl">
      <h2 className="text-lg font-bold text-slate-800 mb-1">Archivos de remanentes manuales</h2>
      <p className="text-sm text-slate-500 mb-4">
        Cargá acá los nombres de archivo (tal cual figuran en el WMS, en Carga inicial &gt; Resumen CI &gt; Pedido) que
        quieras sumar a Remanentes aunque no lleven la palabra REMA. Al apretar &quot;Actualizar desde WMS&quot; en
        Importar Datos, el Agente Local los busca en el WMS, los descarga junto con los REMA de siempre y los importa.
        Mientras estén en esta lista cuentan como remanentes en Resumen y Avance Plan. Un nombre por línea.
      </p>
      {archivosManualesError && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{archivosManualesError}</div>
      )}
      <textarea
        value={formArchivosTexto}
        onChange={(e) => setFormArchivosTexto(e.target.value)}
        placeholder={"Ej: CI- 1 CQ VER PRENDAS 29-05 - 1293\nCI- 2 CHK INV CALZADO 02-06 - 1301"}
        rows={4}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none mb-3"
      />
      <input
        type="text"
        value={formArchivosNota}
        onChange={(e) => setFormArchivosNota(e.target.value)}
        placeholder="Nota (opcional, ej: motivo)"
        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-4"
      />
      <button
        onClick={agregarArchivosManuales}
        disabled={!formArchivosTexto.trim() || agregandoArchivos}
        className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          !formArchivosTexto.trim() || agregandoArchivos
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {agregandoArchivos ? "Guardando..." : "Agregar archivos"}
      </button>

      <h3 className="text-sm font-bold text-slate-700 mt-8 mb-3">Archivos cargados</h3>
      {archivosManualesLoading && archivosManuales.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 text-left">Archivo</th>
              <th className="py-3 px-4 text-left">Nota</th>
              <th className="py-3 px-4 text-left">Cargado</th>
              <th className="py-3 px-4 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {archivosManuales.map((a) => (
              <tr key={a.id}>
                <td className="py-3 px-4 text-left font-semibold text-slate-800">{a.archivo}</td>
                <td className="py-3 px-4 text-left text-slate-600">{a.nota || "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fmtFecha(a.created_at)}</td>
                <td className="py-3 px-4 text-left">
                  <button onClick={() => eliminarArchivoManual(a.id, a.archivo)} className="text-sm text-red-600 hover:underline">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {archivosManuales.length === 0 && !archivosManualesLoading && (
          <p className="text-sm text-slate-400 text-center py-8">No hay archivos cargados a mano todavía.</p>
        )}
      </div>
    </div>
    </div>
  );
}

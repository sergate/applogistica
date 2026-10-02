"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtSoloFecha } from "@/components/dashboard/formatters";
import type { PlanCargaInicial } from "./types";

interface ObservacionArticulos {
  observacion: string;
  fecha: string;
  articulos: string[];
}

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

  // Artículos master por observación (colección) -- alimentan Colecciones.
  const [observaciones, setObservaciones] = useState<ObservacionArticulos[]>([]);
  const [observacionesLoading, setObservacionesLoading] = useState(false);
  const [observacionesError, setObservacionesError] = useState<string | null>(null);
  const [formArticulosTexto, setFormArticulosTexto] = useState("");
  const [formObservacion, setFormObservacion] = useState("");
  const [formFechaArticulos, setFormFechaArticulos] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [agregandoArticulos, setAgregandoArticulos] = useState(false);
  const [mensajeArticulos, setMensajeArticulos] = useState<string | null>(null);
  const [observacionAbierta, setObservacionAbierta] = useState<string | null>(null);
  const [observacionPorEliminar, setObservacionPorEliminar] = useState<string | null>(null);

  const cargarObservaciones = async () => {
    setObservacionesLoading(true);
    setObservacionesError(null);
    try {
      const res = await fetch("/api/carga-inicial/articulos-master", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los artículos master.");
      setObservaciones(data.observaciones);
    } catch (err) {
      setObservacionesError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setObservacionesLoading(false);
    }
  };

  const articulosDelForm = Array.from(new Set(formArticulosTexto.split(/\r?\n/).map((a) => a.trim()).filter(Boolean)));
  const articulosFormValido = articulosDelForm.length > 0 && formObservacion.trim() !== "" && !!formFechaArticulos;

  const agregarArticulosMaster = async () => {
    if (!articulosFormValido) return;
    setAgregandoArticulos(true);
    setObservacionesError(null);
    setMensajeArticulos(null);
    try {
      const res = await fetch("/api/carga-inicial/articulos-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articulos: articulosDelForm, observacion: formObservacion, fecha: formFechaArticulos }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron agregar los artículos.");
      setMensajeArticulos(
        `Se agregaron ${data.agregados} artículo${data.agregados === 1 ? "" : "s"} a «${data.observacion}».` +
          (data.agregados < articulosDelForm.length ? " El resto ya estaba en esa observación." : "")
      );
      setFormArticulosTexto("");
      setFormObservacion("");
      setObservacionAbierta(data.observacion);
      await cargarObservaciones();
      setDataVersion((v) => v + 1); // refresca Colecciones
    } catch (err) {
      setObservacionesError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoArticulos(false);
    }
  };

  const eliminarObservacion = async (observacion: string) => {
    setObservacionesError(null);
    setMensajeArticulos(null);
    try {
      const res = await fetch("/api/carga-inicial/articulos-master", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacion }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar la observación.");
      setObservacionPorEliminar(null);
      if (observacionAbierta === observacion) setObservacionAbierta(null);
      setMensajeArticulos(`Se eliminó la observación «${observacion}» con todos sus artículos.`);
      await cargarObservaciones();
      setDataVersion((v) => v + 1);
    } catch (err) {
      setObservacionesError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

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
    cargarObservaciones();
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
    <div className="space-y-6">
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

    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-4xl">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Artículos master por colección</h2>
      <p className="text-sm text-slate-500 mb-6">
        Registrá artículos master con una observación (la colección a la que pertenecen) y una fecha. Al importar la
        Carga Inicial, la subsección &quot;Colecciones&quot; agrupa los pedidos de estos artículos bajo esa observación.
        Un artículo se reconoce por su SKU: podés cargar el SKU completo o el código base (por ejemplo, el código sin
        color ni talle).
      </p>

      {observacionesError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{observacionesError}</div>
      )}
      {mensajeArticulos && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{mensajeArticulos}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-6 items-start mb-2">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Artículos master (uno por línea)</label>
          <textarea
            value={formArticulosTexto}
            onChange={(e) => setFormArticulosTexto(e.target.value)}
            placeholder={"Ej: MST-48213\nMST-48214"}
            rows={6}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Observación (colección)</label>
            <input
              type="text"
              value={formObservacion}
              onChange={(e) => setFormObservacion(e.target.value)}
              placeholder="Ej: BASICOS VERANO 26"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Fecha</label>
            <input
              type="date"
              value={formFechaArticulos}
              onChange={(e) => setFormFechaArticulos(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">Si la observación ya existe, los artículos se suman a esa colección.</p>
      <button
        onClick={agregarArticulosMaster}
        disabled={!articulosFormValido || agregandoArticulos}
        className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          !articulosFormValido || agregandoArticulos
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {agregandoArticulos ? "Guardando..." : "Agregar artículos"}
      </button>

      <div className="mt-8 pt-6 border-t border-slate-200">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700">Colecciones registradas ({observaciones.length})</h3>
          <span className="text-xs text-slate-500">
            {observaciones.reduce((acc, o) => acc + o.articulos.length, 0)} artículos master en total
          </span>
        </div>

        {observacionesLoading && observaciones.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
        {!observacionesLoading && observaciones.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">No hay observaciones registradas todavía.</p>
        )}

        <div className="space-y-3">
          {observaciones.map((o) => {
            const abierta = observacionAbierta === o.observacion;
            const confirmando = observacionPorEliminar === o.observacion;
            return (
              <div key={o.observacion} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div className="flex items-center gap-4 flex-wrap px-4 py-3.5">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-bold text-slate-900">{o.observacion}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {o.articulos.length} artículo{o.articulos.length === 1 ? "" : "s"} · fecha {fmtSoloFecha(o.fecha)}
                    </div>
                  </div>
                  <button
                    onClick={() => setObservacionAbierta(abierta ? null : o.observacion)}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    {abierta ? "Ocultar artículos" : "Ver artículos"}
                  </button>
                  {confirmando ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-red-700">
                        Se quitan los {o.articulos.length} artículos de esta colección.
                      </span>
                      <button
                        onClick={() => setObservacionPorEliminar(null)}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => eliminarObservacion(o.observacion)}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-700 text-white hover:bg-red-800 transition-colors"
                      >
                        Sí, eliminar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setObservacionPorEliminar(o.observacion)}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                    >
                      Eliminar observación
                    </button>
                  )}
                </div>
                {abierta && (
                  <div className="px-4 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-2">
                    {o.articulos.map((a) => (
                      <span key={a} className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono font-semibold text-slate-800">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </div>
  );
}

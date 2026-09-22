"use client";

import { useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtFecha } from "@/components/dashboard/formatters";
import { filasDespachoFiltradas, type DespachoGuiaFila } from "./types";

export default function DESPImprimir() {
  const { activeTab, dataVersion, setDataVersion, tienePermiso } = useDashboard();

  const [despachoImprimiendoEnCurso, setDespachoImprimiendoEnCurso] = useState(false);
  const {
    data: despachoImprimirData,
    error: despachoImprimirError,
    isLoading: despachoImprimirLoading,
  } = useTabData<{ filas: DespachoGuiaFila[]; updatedAt: string | null }>(
    activeTab,
    "DESP-Imprimir",
    "/api/despacho/guias?vista=imprimir",
    dataVersion,
    { refreshInterval: despachoImprimiendoEnCurso ? 3000 : 0 }
  );
  const [despachoImprimirSeleccion, setDespachoImprimirSeleccion] = useState<Set<number>>(new Set());
  const toggleDespachoImprimirFila = (id: number) => {
    setDespachoImprimirSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [filtroClienteImprimir, setFiltroClienteImprimir] = useState("");
  const [filtroTipoImprimir, setFiltroTipoImprimir] = useState("TODOS");
  const [filtroGrupoImprimir, setFiltroGrupoImprimir] = useState("TODOS");
  const tiposDisponiblesImprimir = [...new Set((despachoImprimirData?.filas || []).map((f) => f.tipo || "SIN TIPO"))].sort();
  const gruposDisponiblesImprimir = [
    ...new Set((despachoImprimirData?.filas || []).flatMap((f) => (f.grupos.length > 0 ? f.grupos : ["SIN GRUPO"]))),
  ].sort();
  const filasFiltradasImprimir = filasDespachoFiltradas(
    despachoImprimirData?.filas || [],
    filtroClienteImprimir,
    filtroTipoImprimir,
    filtroGrupoImprimir
  );
  const toggleDespachoImprimirTodas = () => {
    setDespachoImprimirSeleccion((prev) =>
      prev.size === filasFiltradasImprimir.length
        ? new Set()
        : new Set(filasFiltradasImprimir.map((f) => f.despacho_cab_id))
    );
  };
  const [marcandoManualImprimir, setMarcandoManualImprimir] = useState(false);
  const marcarSeleccionadasComoImpresas = async () => {
    if (despachoImprimirSeleccion.size === 0) return;
    if (
      !confirm(
        `¿Marcar ${despachoImprimirSeleccion.size} guía(s) como ya impresas manualmente? ` +
          `Se van a mover a "Guías Impresas" sin pasar por el Agente Local.`
      )
    ) {
      return;
    }
    setMarcandoManualImprimir(true);
    try {
      const guias = (despachoImprimirData?.filas || [])
        .filter((f) => despachoImprimirSeleccion.has(f.despacho_cab_id))
        .map((f) => ({ despachoCabId: f.despacho_cab_id, guia: f.guia }));
      const res = await fetch("/api/admin/despacho-guias/marcar-impresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guias }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error inesperado");
      setDataVersion((v) => v + 1);
      setDespachoImprimirSeleccion(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error inesperado marcando las guías como impresas.");
    } finally {
      setMarcandoManualImprimir(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800">Despacho — Para Imprimir</h2>
        {despachoImprimirData && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Última actualización: <span className="font-medium text-slate-700">{fmtFecha(despachoImprimirData.updatedAt)}</span>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Guías de despacho del WMS que todavía no se imprimieron completas (guía + remito). Importá las
        guías de hoy y después seleccioná cuáles mandar a imprimir.
      </p>

      {tienePermiso("DESP-Imprimir") && (
        <>
          <AgenteTokenPanel />
          <ActualizarAgenteBoton seccion="despacho_importar" onExito={() => setDataVersion((v) => v + 1)} />
          <ActualizarAgenteBoton
            seccion="despacho_imprimir"
            label={`Imprimir seleccionadas (${despachoImprimirSeleccion.size})`}
            deshabilitado={despachoImprimirSeleccion.size === 0}
            payload={{
              guias: (despachoImprimirData?.filas || [])
                .filter((f) => despachoImprimirSeleccion.has(f.despacho_cab_id))
                .map((f) => ({ despachoCabId: f.despacho_cab_id, guia: f.guia, tipo: f.tipo })),
            }}
            onCorriendoChange={setDespachoImprimiendoEnCurso}
            onExito={() => {
              setDataVersion((v) => v + 1);
              setDespachoImprimirSeleccion(new Set());
            }}
          />
          {tienePermiso("DESP-Grupos") && (
            <button
              type="button"
              onClick={marcarSeleccionadasComoImpresas}
              disabled={despachoImprimirSeleccion.size === 0 || marcandoManualImprimir}
              title="Solo para casos donde la guía y el remito ya se imprimieron a mano, fuera del sistema."
              className="ml-2 mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {marcandoManualImprimir
                ? "Marcando..."
                : `Marcar como impresas (manual) (${despachoImprimirSeleccion.size})`}
            </button>
          )}
        </>
      )}

      {despachoImprimirError && (
        <div className="mt-4 mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar las guías: {despachoImprimirError}
        </div>
      )}
      {despachoImprimirLoading && !despachoImprimirData && (
        <div className="mt-4 mb-4 rounded-lg border border-slate-200 overflow-hidden">
          <SkeletonTable rows={6} columns={13} />
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 mb-4 flex-wrap">
        <input
          type="text"
          value={filtroClienteImprimir}
          onChange={(e) => setFiltroClienteImprimir(e.target.value)}
          placeholder="Buscar por cliente..."
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-56"
        />
        <select
          value={filtroTipoImprimir}
          onChange={(e) => setFiltroTipoImprimir(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODOS">Todos los tipos</option>
          {tiposDisponiblesImprimir.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filtroGrupoImprimir}
          onChange={(e) => setFiltroGrupoImprimir(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODOS">Todos los grupos</option>
          {gruposDisponiblesImprimir.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        {(filtroClienteImprimir || filtroTipoImprimir !== "TODOS" || filtroGrupoImprimir !== "TODOS") && (
          <button
            onClick={() => {
              setFiltroClienteImprimir("");
              setFiltroTipoImprimir("TODOS");
              setFiltroGrupoImprimir("TODOS");
            }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 text-left">
                <input
                  type="checkbox"
                  checked={filasFiltradasImprimir.length > 0 && despachoImprimirSeleccion.size === filasFiltradasImprimir.length}
                  onChange={toggleDespachoImprimirTodas}
                  className="rounded border-slate-300"
                />
              </th>
              <th className="py-3 px-4 text-left">Guía</th>
              <th className="py-3 px-4 text-left">Fecha creación</th>
              <th className="py-3 px-4 text-left">Cliente</th>
              <th className="py-3 px-4 text-left">Grupo</th>
              <th className="py-3 px-4 text-left">Transporte</th>
              <th className="py-3 px-4 text-left">Tipo</th>
              <th className="py-3 px-4 text-left">Cajas</th>
              <th className="py-3 px-4 text-left">Unid.</th>
              <th className="py-3 px-4 text-left">Bultos insumos</th>
              <th className="py-3 px-4 text-left">Bultos producto</th>
              <th className="py-3 px-4 text-left">Estado WMS</th>
              <th className="py-3 px-4 text-left">Guía impresa</th>
              <th className="py-3 px-4 text-left">Remito impreso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filasFiltradasImprimir.map((fila) => (
              <tr key={fila.despacho_cab_id}>
                <td className="py-3 px-4 text-left">
                  <input
                    type="checkbox"
                    checked={despachoImprimirSeleccion.has(fila.despacho_cab_id)}
                    onChange={() => toggleDespachoImprimirFila(fila.despacho_cab_id)}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="py-3 px-4 text-left font-medium text-slate-700">{fila.numero_guia || fila.guia}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fmtFecha(fila.fecha_creacion)}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.cliente || "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.grupos.length > 0 ? fila.grupos.join(", ") : "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.transporte || "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.tipo || "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.cajas ?? "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.unidades ?? "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.bultos_insumos ?? "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.bultos_producto ?? "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.estado_wms || "—"}</td>
                <td className="py-3 px-4 text-left">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      fila.guia_impresa ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {fila.guia_impresa ? "Sí" : "No"}
                  </span>
                </td>
                <td className="py-3 px-4 text-left">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      fila.remito_impreso ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {fila.remito_impreso ? "Sí" : "No"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {despachoImprimirData && filasFiltradasImprimir.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">
            {despachoImprimirData.filas.length === 0
              ? "No hay guías pendientes de imprimir. Importá las guías de hoy desde el WMS."
              : "Ninguna guía coincide con los filtros."}
          </p>
        )}
      </div>
    </div>
  );
}

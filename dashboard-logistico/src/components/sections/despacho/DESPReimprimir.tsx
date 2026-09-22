"use client";

import { useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtFecha } from "@/components/dashboard/formatters";
import { filasDespachoFiltradas, type DespachoGuiaFila } from "./types";

export default function DESPReimprimir() {
  const { activeTab, dataVersion, setDataVersion, tienePermiso } = useDashboard();

  const [despachoReimprimiendoEnCurso, setDespachoReimprimiendoEnCurso] = useState(false);
  const {
    data: despachoReimprimirData,
    error: despachoReimprimirError,
    isLoading: despachoReimprimirLoading,
  } = useTabData<{ filas: DespachoGuiaFila[]; updatedAt: string | null }>(
    activeTab,
    "DESP-Reimprimir",
    "/api/despacho/guias?vista=reimprimir",
    dataVersion,
    { refreshInterval: despachoReimprimiendoEnCurso ? 3000 : 0 }
  );
  const [despachoReimprimirSeleccion, setDespachoReimprimirSeleccion] = useState<Set<number>>(new Set());
  const [despachoReimprimirDocumentos, setDespachoReimprimirDocumentos] = useState<"ambos" | "guia" | "remito">("ambos");
  const toggleDespachoReimprimirFila = (id: number) => {
    setDespachoReimprimirSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [filtroClienteReimprimir, setFiltroClienteReimprimir] = useState("");
  const [filtroTipoReimprimir, setFiltroTipoReimprimir] = useState("TODOS");
  const [filtroGrupoReimprimir, setFiltroGrupoReimprimir] = useState("TODOS");
  const tiposDisponiblesReimprimir = [...new Set((despachoReimprimirData?.filas || []).map((f) => f.tipo || "SIN TIPO"))].sort();
  const gruposDisponiblesReimprimir = [
    ...new Set((despachoReimprimirData?.filas || []).flatMap((f) => (f.grupos.length > 0 ? f.grupos : ["SIN GRUPO"]))),
  ].sort();
  const filasFiltradasReimprimir = filasDespachoFiltradas(
    despachoReimprimirData?.filas || [],
    filtroClienteReimprimir,
    filtroTipoReimprimir,
    filtroGrupoReimprimir
  );
  const toggleDespachoReimprimirTodas = () => {
    setDespachoReimprimirSeleccion((prev) =>
      prev.size === filasFiltradasReimprimir.length
        ? new Set()
        : new Set(filasFiltradasReimprimir.map((f) => f.despacho_cab_id))
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800">Despacho — Guías Impresas</h2>
        {despachoReimprimirData && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Última actualización: <span className="font-medium text-slate-700">{fmtFecha(despachoReimprimirData.updatedAt)}</span>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Guías que ya se imprimieron completas (guía + remito). Cada reimpresión queda registrada con tu
        usuario y la fecha/hora.
      </p>

      {tienePermiso("DESP-Reimprimir") && (
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={despachoReimprimirDocumentos}
            onChange={(e) => setDespachoReimprimirDocumentos(e.target.value as "ambos" | "guia" | "remito")}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ambos">Guía y remito</option>
            <option value="guia">Solo guía</option>
            <option value="remito">Solo remito</option>
          </select>
          <ActualizarAgenteBoton
            seccion="despacho_reimprimir"
            label={`Reimprimir seleccionadas (${despachoReimprimirSeleccion.size})`}
            deshabilitado={despachoReimprimirSeleccion.size === 0}
            payload={{
              documentos: despachoReimprimirDocumentos,
              guias: (despachoReimprimirData?.filas || [])
                .filter((f) => despachoReimprimirSeleccion.has(f.despacho_cab_id))
                .map((f) => ({ despachoCabId: f.despacho_cab_id, guia: f.guia, tipo: f.tipo })),
            }}
            onCorriendoChange={setDespachoReimprimiendoEnCurso}
            onExito={() => {
              setDataVersion((v) => v + 1);
              setDespachoReimprimirSeleccion(new Set());
            }}
          />
        </div>
      )}

      {despachoReimprimirError && (
        <div className="mt-4 mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar las guías: {despachoReimprimirError}
        </div>
      )}
      {despachoReimprimirLoading && !despachoReimprimirData && (
        <div className="mt-4 mb-4 rounded-lg border border-slate-200 overflow-hidden">
          <SkeletonTable rows={6} columns={11} />
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 mb-4 flex-wrap">
        <input
          type="text"
          value={filtroClienteReimprimir}
          onChange={(e) => setFiltroClienteReimprimir(e.target.value)}
          placeholder="Buscar por cliente..."
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-56"
        />
        <select
          value={filtroTipoReimprimir}
          onChange={(e) => setFiltroTipoReimprimir(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODOS">Todos los tipos</option>
          {tiposDisponiblesReimprimir.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filtroGrupoReimprimir}
          onChange={(e) => setFiltroGrupoReimprimir(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODOS">Todos los grupos</option>
          {gruposDisponiblesReimprimir.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        {(filtroClienteReimprimir || filtroTipoReimprimir !== "TODOS" || filtroGrupoReimprimir !== "TODOS") && (
          <button
            onClick={() => {
              setFiltroClienteReimprimir("");
              setFiltroTipoReimprimir("TODOS");
              setFiltroGrupoReimprimir("TODOS");
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
                  checked={filasFiltradasReimprimir.length > 0 && despachoReimprimirSeleccion.size === filasFiltradasReimprimir.length}
                  onChange={toggleDespachoReimprimirTodas}
                  className="rounded border-slate-300"
                />
              </th>
              <th className="py-3 px-4 text-left">Guía</th>
              <th className="py-3 px-4 text-left">Cliente</th>
              <th className="py-3 px-4 text-left">Grupo</th>
              <th className="py-3 px-4 text-left">Transporte</th>
              <th className="py-3 px-4 text-left">Tipo</th>
              <th className="py-3 px-4 text-left">Bultos insumos</th>
              <th className="py-3 px-4 text-left">Bultos producto</th>
              <th className="py-3 px-4 text-left">Guía impresa</th>
              <th className="py-3 px-4 text-left">Remito impreso</th>
              <th className="py-3 px-4 text-left">Última impresión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filasFiltradasReimprimir.map((fila) => (
              <tr key={fila.despacho_cab_id}>
                <td className="py-3 px-4 text-left">
                  <input
                    type="checkbox"
                    checked={despachoReimprimirSeleccion.has(fila.despacho_cab_id)}
                    onChange={() => toggleDespachoReimprimirFila(fila.despacho_cab_id)}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="py-3 px-4 text-left font-medium text-slate-700">{fila.numero_guia || fila.guia}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.cliente || "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.grupos.length > 0 ? fila.grupos.join(", ") : "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.transporte || "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.tipo || "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.bultos_insumos ?? "—"}</td>
                <td className="py-3 px-4 text-left text-slate-600">{fila.bultos_producto ?? "—"}</td>
                <td className="py-3 px-4 text-left">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                    Sí
                  </span>
                </td>
                <td className="py-3 px-4 text-left">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                    Sí
                  </span>
                </td>
                <td className="py-3 px-4 text-left text-slate-600">
                  {fmtFecha(fila.remito_impreso_en || fila.guia_impresa_en)}
                  {(fila.remito_impreso_por_nombre || fila.guia_impresa_por_nombre) && (
                    <span className="text-slate-400"> — {fila.remito_impreso_por_nombre || fila.guia_impresa_por_nombre}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {despachoReimprimirData && filasFiltradasReimprimir.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">
            {despachoReimprimirData.filas.length === 0
              ? "No hay guías impresas completas todavía."
              : "Ninguna guía coincide con los filtros."}
          </p>
        )}
      </div>
    </div>
  );
}

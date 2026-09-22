"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha } from "@/components/dashboard/formatters";
import type { REMDetalleFila } from "./types";

export default function RemResumen() {
  const { activeTab, dataVersion, tienePermiso, setDataVersion } = useDashboard();

  const {
    data: remDetalleData,
    error: remDetalleError,
    isLoading: remDetalleLoading,
  } = useTabData<{ filas: REMDetalleFila[]; updatedAt: string | null }>(
    activeTab,
    "REM-Resumen",
    "/api/remanentes/detalle",
    dataVersion
  );

  const [filtroMarcaREM, setFiltroMarcaREM] = useState("TODAS");
  const [filtroTemporadaREM, setFiltroTemporadaREM] = useState("TODAS");
  const [filtroGrupoREM, setFiltroGrupoREM] = useState("TODAS");
  const [filaExpandidaREM, setFilaExpandidaREM] = useState<{ marca: string; archivo: string } | null>(null);
  const [eliminandoArchivoREM, setEliminandoArchivoREM] = useState<string | null>(null);
  const [eliminarArchivoErrorREM, setEliminarArchivoErrorREM] = useState<string | null>(null);

  const eliminarArchivoREM = async (archivo: string) => {
    if (!confirm(`¿Confirmás que querés borrar de la base de datos todos los registros del archivo "${archivo}"? Esta acción no se puede deshacer.`)) return;
    setEliminandoArchivoREM(archivo);
    setEliminarArchivoErrorREM(null);
    try {
      const res = await fetch("/api/remanentes/eliminar-archivo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: archivo }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo borrar el archivo.");
      if (filaExpandidaREM?.archivo === archivo) setFilaExpandidaREM(null);
      setDataVersion((v) => v + 1);
    } catch (err) {
      setEliminarArchivoErrorREM(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEliminandoArchivoREM(null);
    }
  };

  const marcasDisponiblesREM = Array.from(new Set((remDetalleData?.filas ?? []).map((f) => f.marca))).sort();
  const temporadasDisponiblesREM = Array.from(new Set((remDetalleData?.filas ?? []).map((f) => f.temporada))).sort();
  const gruposDisponiblesREM = Array.from(new Set((remDetalleData?.filas ?? []).map((f) => f.grupo))).sort();

  // Filtrado + consolidación por (marca, archivo) + subtotal, todo junto en
  // un useMemo para no recalcularlo en cada render del componente.
  const { filasFiltradasREM, filasTablaREM, subtotalREMCalculado } = useMemo(() => {
    const filasFiltradasREM = (remDetalleData?.filas ?? []).filter(
      (f) =>
        (filtroMarcaREM === "TODAS" || f.marca === filtroMarcaREM) &&
        (filtroTemporadaREM === "TODAS" || f.temporada === filtroTemporadaREM) &&
        (filtroGrupoREM === "TODAS" || f.grupo === filtroGrupoREM)
    );

    // Consolidamos por (marca, archivo) para la tabla principal
    const consolidadoMarcaArchivo = new Map<string, { marca: string; archivo: string; pedidas: number; distribuidas: number; aRepartir: number; stock: number }>();
    for (const f of filasFiltradasREM) {
      const key = `${f.marca}__${f.archivo}`;
      if (!consolidadoMarcaArchivo.has(key)) {
        consolidadoMarcaArchivo.set(key, { marca: f.marca, archivo: f.archivo, pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 });
      }
      const acc = consolidadoMarcaArchivo.get(key)!;
      acc.pedidas += f.pedidas;
      acc.distribuidas += f.distribuidas;
      acc.aRepartir += f.aRepartir;
      acc.stock += f.stock;
    }

    // Total de pedidas por marca (para ordenar las marcas de mayor a menor)
    const totalPedidasPorMarcaREM = new Map<string, number>();
    for (const acc of consolidadoMarcaArchivo.values()) {
      totalPedidasPorMarcaREM.set(acc.marca, (totalPedidasPorMarcaREM.get(acc.marca) || 0) + acc.pedidas);
    }

    const filasTablaREM = Array.from(consolidadoMarcaArchivo.values())
      .map((acc) => ({
        ...acc,
        completitud: acc.pedidas > 0 ? (acc.distribuidas / acc.pedidas) * 100 : 0,
      }))
      .sort((a, b) => {
        const totalA = totalPedidasPorMarcaREM.get(a.marca) || 0;
        const totalB = totalPedidasPorMarcaREM.get(b.marca) || 0;
        if (a.marca !== b.marca) return totalB - totalA;
        return a.archivo.localeCompare(b.archivo);
      });

    // Subtotal general sobre los datos filtrados
    const subtotalREM = filasFiltradasREM.reduce(
      (acc, f) => ({
        pedidas: acc.pedidas + f.pedidas,
        distribuidas: acc.distribuidas + f.distribuidas,
        aRepartir: acc.aRepartir + f.aRepartir,
        stock: acc.stock + f.stock,
      }),
      { pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 }
    );
    const subtotalREMCalculado = {
      ...subtotalREM,
      completitud: subtotalREM.pedidas > 0 ? (subtotalREM.distribuidas / subtotalREM.pedidas) * 100 : 0,
    };

    return { filasFiltradasREM, filasTablaREM, subtotalREMCalculado };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remDetalleData, filtroMarcaREM, filtroTemporadaREM, filtroGrupoREM]);

  // Desglose por grupo de la fila (marca + archivo) expandida -- se calcula
  // sobre los mismos datos ya filtrados por temporada/grupo/marca.
  const desgloseGrupoREM = useMemo(() => {
    if (!filaExpandidaREM) return [];
    const porGrupo = new Map<string, { grupo: string; pedidas: number; distribuidas: number; aRepartir: number; stock: number }>();
    for (const f of filasFiltradasREM) {
      if (f.marca !== filaExpandidaREM.marca || f.archivo !== filaExpandidaREM.archivo) continue;
      if (!porGrupo.has(f.grupo)) {
        porGrupo.set(f.grupo, { grupo: f.grupo, pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 });
      }
      const acc = porGrupo.get(f.grupo)!;
      acc.pedidas += f.pedidas;
      acc.distribuidas += f.distribuidas;
      acc.aRepartir += f.aRepartir;
      acc.stock += f.stock;
    }
    return Array.from(porGrupo.values())
      .map((acc) => ({ ...acc, completitud: acc.pedidas > 0 ? (acc.distribuidas / acc.pedidas) * 100 : 0 }))
      .sort((a, b) => b.pedidas - a.pedidas);
  }, [filasFiltradasREM, filaExpandidaREM]);

  const handleFilaClickREM = (marca: string, archivo: string) => {
    setFilaExpandidaREM(
      filaExpandidaREM?.marca === marca && filaExpandidaREM?.archivo === archivo ? null : { marca, archivo }
    );
  };

  return (
    <div className="space-y-6">
      {/* --- TABLA DE DETALLE POR MARCA / ARCHIVO --- */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-800">Detalle por Marca / Archivo</h2>
          {remDetalleData && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(remDetalleData.updatedAt)}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-4">Hacé click en un archivo para ver el desglose por grupo</p>

        {/* FILTROS */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <select
            value={filtroMarcaREM}
            onChange={(e) => setFiltroMarcaREM(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="TODAS">Todas las marcas</option>
            {marcasDisponiblesREM.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={filtroTemporadaREM}
            onChange={(e) => setFiltroTemporadaREM(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="TODAS">Todas las temporadas</option>
            {temporadasDisponiblesREM.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={filtroGrupoREM}
            onChange={(e) => setFiltroGrupoREM(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="TODAS">Todos los grupos</option>
            {gruposDisponiblesREM.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <button
            onClick={() => {
              setFiltroMarcaREM("TODAS");
              setFiltroTemporadaREM("TODAS");
              setFiltroGrupoREM("TODAS");
            }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Limpiar filtros
          </button>
        </div>

        {remDetalleError && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            Error al cargar el detalle: {remDetalleError}
          </div>
        )}
        {eliminarArchivoErrorREM && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {eliminarArchivoErrorREM}
          </div>
        )}
        {remDetalleLoading && !remDetalleData && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
            <SkeletonTable rows={6} columns={5} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              {filasTablaREM.length > 0 && (
                <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                  <td className="py-3 px-4 text-left" colSpan={2}>
                    Subtotal
                    {filtroMarcaREM !== "TODAS" ? ` — ${filtroMarcaREM}` : " — Todas las marcas"}
                    {filtroTemporadaREM !== "TODAS" ? ` — ${filtroTemporadaREM}` : ""}
                    {filtroGrupoREM !== "TODAS" ? ` — ${filtroGrupoREM}` : ""}
                  </td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotalREMCalculado.pedidas)}</td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotalREMCalculado.distribuidas)}</td>
                  <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(subtotalREMCalculado.aRepartir)}</td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotalREMCalculado.stock)}</td>
                  <td className="py-3 px-4 text-left">{fmtPct(subtotalREMCalculado.completitud)}</td>
                  {tienePermiso("REM-EliminarArchivo") && <td className="py-3 px-4 text-left"></td>}
                </tr>
              )}
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Marca</th>
                <th className="py-3 px-4 text-left">Archivo</th>
                <th className="py-3 px-4 text-left">Unidades Pedidas</th>
                <th className="py-3 px-4 text-left">Unidades Distribuidas</th>
                <th className="py-3 px-4 text-left">Unidades a Repartir</th>
                <th className="py-3 px-4 text-left">Unidades en Stock</th>
                <th className="py-3 px-4 text-left">% Completitud</th>
                {tienePermiso("REM-EliminarArchivo") && <th className="py-3 px-4 text-left">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filasTablaREM.map((row, i) => {
                const estaExpandida =
                  filaExpandidaREM?.marca === row.marca && filaExpandidaREM?.archivo === row.archivo;
                return (
                <>
                  <tr
                    key={`${row.marca}-${row.archivo}-${i}`}
                    onClick={() => handleFilaClickREM(row.marca, row.archivo)}
                    className={`cursor-pointer transition-colors ${
                      estaExpandida ? "bg-slate-100" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="py-3 px-4 text-left font-bold text-slate-900">{row.marca}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{row.archivo}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.pedidas)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.distribuidas)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(row.aRepartir)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.stock)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtPct(row.completitud)}</td>
                    {tienePermiso("REM-EliminarArchivo") && (
                      <td className="py-3 px-4 text-left" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => eliminarArchivoREM(row.archivo)}
                          disabled={eliminandoArchivoREM === row.archivo}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          {eliminandoArchivoREM === row.archivo ? "Borrando..." : "Borrar archivo"}
                        </button>
                      </td>
                    )}
                  </tr>

                  {estaExpandida && (
                      <tr>
                        <td colSpan={tienePermiso("REM-EliminarArchivo") ? 8 : 7} className="bg-slate-50 px-4 py-4">
                          <p className="text-xs font-semibold text-slate-500 mb-2">
                            Desglose por grupo — {row.marca} / {row.archivo}
                          </p>
                          <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                            <thead className="text-slate-500 font-medium border-b border-slate-200">
                              <tr>
                                <th className="py-2 px-3 text-left">Grupo</th>
                                <th className="py-2 px-3 text-left">Unidades Pedidas</th>
                                <th className="py-2 px-3 text-left">Unidades Distribuidas</th>
                                <th className="py-2 px-3 text-left">Unidades a Repartir</th>
                                <th className="py-2 px-3 text-left">Unidades en Stock</th>
                                <th className="py-2 px-3 text-left">% Completitud</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {desgloseGrupoREM.map((g, gi) => (
                                <tr key={gi}>
                                  <td className="py-2 px-3 text-left font-medium text-slate-700">{g.grupo}</td>
                                  <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.pedidas)}</td>
                                  <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.distribuidas)}</td>
                                  <td className="py-2 px-3 text-left font-semibold text-orange-500">{fmtNum(g.aRepartir)}</td>
                                  <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.stock)}</td>
                                  <td className="py-2 px-3 text-left text-slate-600">{fmtPct(g.completitud)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                </>
                );
              })}
            </tbody>
          </table>
          {filasTablaREM.length === 0 && !remDetalleLoading && (
            <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
          )}
        </div>
      </div>
    </div>
  );
}

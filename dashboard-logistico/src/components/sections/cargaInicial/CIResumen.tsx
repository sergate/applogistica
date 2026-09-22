"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha } from "@/components/dashboard/formatters";

interface CIDetalleFila {
  marca: string;
  curva: string;
  grupo: string;
  temporada: string;
  pedidas: number;
  distribuidas: number;
  aRepartir: number;
  stock: number;
}

interface CIArchivoResumen {
  archivo: string;
  pedidas: number;
  distribuidas: number;
  aRepartir: number;
  stock: number;
}

// Orden fijo de curvas: ADELANTO, 1RA ETAPA, SEGUNDA ETAPA, y las que sigan
// (desconocidas van al final, ordenadas alfabéticamente entre sí).
const ORDEN_CURVAS = ["ADELANTO", "1RA ETAPA", "SEGUNDA ETAPA"];
const rankCurva = (curva: string) => {
  const idx = ORDEN_CURVAS.indexOf(curva);
  return idx === -1 ? 100 : idx;
};

export default function CIResumen() {
  const { activeTab, dataVersion, tienePermiso, setDataVersion } = useDashboard();

  const {
    data: ciDetalleData,
    error: ciDetalleError,
    isLoading: ciDetalleLoading,
  } = useTabData<{ filas: CIDetalleFila[]; archivos: CIArchivoResumen[]; updatedAt: string | null }>(
    activeTab,
    "CI-Resumen",
    "/api/carga-inicial/detalle",
    dataVersion
  );

  const [filtroMarcaCI, setFiltroMarcaCI] = useState("TODAS");
  const [filtroTemporadaCI, setFiltroTemporadaCI] = useState("TODAS");
  const [filtroGrupoCI, setFiltroGrupoCI] = useState("TODAS");
  const [filaExpandidaCI, setFilaExpandidaCI] = useState<{ marca: string; curva: string } | null>(null);
  const [eliminandoArchivoCI, setEliminandoArchivoCI] = useState<string | null>(null);
  const [eliminarArchivoErrorCI, setEliminarArchivoErrorCI] = useState<string | null>(null);

  const eliminarArchivoCI = async (archivo: string) => {
    if (!confirm(`¿Confirmás que querés borrar de la base de datos todos los registros del archivo "${archivo}"? Esta acción no se puede deshacer.`)) return;
    setEliminandoArchivoCI(archivo);
    setEliminarArchivoErrorCI(null);
    try {
      const res = await fetch("/api/carga-inicial/eliminar-archivo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: archivo }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo borrar el archivo.");
      setDataVersion((v) => v + 1);
    } catch (err) {
      setEliminarArchivoErrorCI(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEliminandoArchivoCI(null);
    }
  };

  const marcasDisponiblesCI = Array.from(new Set((ciDetalleData?.filas ?? []).map((f) => f.marca))).sort();
  const temporadasDisponiblesCI = Array.from(new Set((ciDetalleData?.filas ?? []).map((f) => f.temporada))).sort();
  const gruposDisponiblesCI = Array.from(new Set((ciDetalleData?.filas ?? []).map((f) => f.grupo))).sort();

  // Filtrado + consolidación por (marca, curva) + subtotal, todo junto en
  // un useMemo para no recalcularlo en cada render del componente.
  const { filasFiltradasCI, filasTablaCI, subtotalCICalculado } = useMemo(() => {
    const filasFiltradasCI = (ciDetalleData?.filas ?? []).filter(
      (f) =>
        (filtroMarcaCI === "TODAS" || f.marca === filtroMarcaCI) &&
        (filtroTemporadaCI === "TODAS" || f.temporada === filtroTemporadaCI) &&
        (filtroGrupoCI === "TODAS" || f.grupo === filtroGrupoCI)
    );

    // Consolidamos por (marca, curva) para la tabla principal
    const consolidadoMarcaCurva = new Map<string, { marca: string; curva: string; pedidas: number; distribuidas: number; aRepartir: number; stock: number }>();
    for (const f of filasFiltradasCI) {
      const key = `${f.marca}__${f.curva}`;
      if (!consolidadoMarcaCurva.has(key)) {
        consolidadoMarcaCurva.set(key, { marca: f.marca, curva: f.curva, pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 });
      }
      const acc = consolidadoMarcaCurva.get(key)!;
      acc.pedidas += f.pedidas;
      acc.distribuidas += f.distribuidas;
      acc.aRepartir += f.aRepartir;
      acc.stock += f.stock;
    }

    // Total de pedidas por marca (para ordenar las marcas de mayor a menor)
    const totalPedidasPorMarca = new Map<string, number>();
    for (const acc of consolidadoMarcaCurva.values()) {
      totalPedidasPorMarca.set(acc.marca, (totalPedidasPorMarca.get(acc.marca) || 0) + acc.pedidas);
    }

    const filasTablaCI = Array.from(consolidadoMarcaCurva.values())
      .map((acc) => ({
        ...acc,
        completitud: acc.pedidas > 0 ? (acc.distribuidas / acc.pedidas) * 100 : 0,
      }))
      .sort((a, b) => {
        const totalA = totalPedidasPorMarca.get(a.marca) || 0;
        const totalB = totalPedidasPorMarca.get(b.marca) || 0;
        if (a.marca !== b.marca) return totalB - totalA;
        return rankCurva(a.curva) - rankCurva(b.curva);
      });

    // Subtotal general sobre los datos filtrados
    const subtotalCI = filasFiltradasCI.reduce(
      (acc, f) => ({
        pedidas: acc.pedidas + f.pedidas,
        distribuidas: acc.distribuidas + f.distribuidas,
        aRepartir: acc.aRepartir + f.aRepartir,
        stock: acc.stock + f.stock,
      }),
      { pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 }
    );
    const subtotalCICalculado = {
      ...subtotalCI,
      completitud: subtotalCI.pedidas > 0 ? (subtotalCI.distribuidas / subtotalCI.pedidas) * 100 : 0,
    };

    return { filasFiltradasCI, filasTablaCI, subtotalCICalculado };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciDetalleData, filtroMarcaCI, filtroTemporadaCI, filtroGrupoCI]);

  // Desglose por grupo de la fila (marca + curva) expandida -- se calcula
  // sobre los mismos datos ya filtrados por temporada/grupo/marca.
  const desgloseGrupoCI = useMemo(() => {
    if (!filaExpandidaCI) return [];
    const porGrupo = new Map<string, { grupo: string; pedidas: number; distribuidas: number; aRepartir: number; stock: number }>();
    for (const f of filasFiltradasCI) {
      if (f.marca !== filaExpandidaCI.marca || f.curva !== filaExpandidaCI.curva) continue;
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
  }, [filasFiltradasCI, filaExpandidaCI]);

  const handleFilaClickCI = (marca: string, curva: string) => {
    setFilaExpandidaCI(
      filaExpandidaCI?.marca === marca && filaExpandidaCI?.curva === curva ? null : { marca, curva }
    );
  };

  return (
    <div className="space-y-6">
      {/* --- TABLA DE DETALLE POR MARCA / CURVA --- */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-800">Detalle por Marca / Curva</h2>
          {ciDetalleData && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(ciDetalleData.updatedAt)}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-4">Hacé click en una curva para ver el desglose por grupo</p>

        {/* FILTROS */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <select
            value={filtroMarcaCI}
            onChange={(e) => setFiltroMarcaCI(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="TODAS">Todas las marcas</option>
            {marcasDisponiblesCI.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={filtroTemporadaCI}
            onChange={(e) => setFiltroTemporadaCI(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="TODAS">Todas las temporadas</option>
            {temporadasDisponiblesCI.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={filtroGrupoCI}
            onChange={(e) => setFiltroGrupoCI(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="TODAS">Todos los grupos</option>
            {gruposDisponiblesCI.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <button
            onClick={() => {
              setFiltroMarcaCI("TODAS");
              setFiltroTemporadaCI("TODAS");
              setFiltroGrupoCI("TODAS");
            }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Limpiar filtros
          </button>
        </div>

        {ciDetalleError && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            Error al cargar el detalle: {ciDetalleError}
          </div>
        )}
        {ciDetalleLoading && !ciDetalleData && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
            <SkeletonTable rows={6} columns={5} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              {filasTablaCI.length > 0 && (
                <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                  <td className="py-3 px-4 text-left" colSpan={2}>
                    Subtotal
                    {filtroMarcaCI !== "TODAS" ? ` — ${filtroMarcaCI}` : " — Todas las marcas"}
                    {filtroTemporadaCI !== "TODAS" ? ` — ${filtroTemporadaCI}` : ""}
                    {filtroGrupoCI !== "TODAS" ? ` — ${filtroGrupoCI}` : ""}
                  </td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotalCICalculado.pedidas)}</td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotalCICalculado.distribuidas)}</td>
                  <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(subtotalCICalculado.aRepartir)}</td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotalCICalculado.stock)}</td>
                  <td className="py-3 px-4 text-left">{fmtPct(subtotalCICalculado.completitud)}</td>
                </tr>
              )}
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Marca</th>
                <th className="py-3 px-4 text-left">Curva</th>
                <th className="py-3 px-4 text-left">Unidades Pedidas</th>
                <th className="py-3 px-4 text-left">Unidades Distribuidas</th>
                <th className="py-3 px-4 text-left">Unidades a Repartir</th>
                <th className="py-3 px-4 text-left">Unidades en Stock</th>
                <th className="py-3 px-4 text-left">% Completitud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filasTablaCI.map((row, i) => {
                const estaExpandida =
                  filaExpandidaCI?.marca === row.marca && filaExpandidaCI?.curva === row.curva;
                return (
                <>
                  <tr
                    key={`${row.marca}-${row.curva}-${i}`}
                    onClick={() => handleFilaClickCI(row.marca, row.curva)}
                    className={`cursor-pointer transition-colors ${
                      estaExpandida ? "bg-slate-100" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="py-3 px-4 text-left font-bold text-slate-900">{row.marca}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{row.curva}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.pedidas)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.distribuidas)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(row.aRepartir)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.stock)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtPct(row.completitud)}</td>
                  </tr>

                  {estaExpandida && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 px-4 py-4">
                          <p className="text-xs font-semibold text-slate-500 mb-2">
                            Desglose por grupo — {row.marca} / {row.curva}
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
                              {desgloseGrupoCI.map((g, gi) => (
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
          {filasTablaCI.length === 0 && !ciDetalleLoading && (
            <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
          )}
        </div>
      </div>

      {tienePermiso("CI-EliminarArchivo") && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Archivos cargados</h2>

          {eliminarArchivoErrorCI && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {eliminarArchivoErrorCI}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="text-slate-500 font-medium border-b border-slate-200">
                  <th className="py-3 px-4 text-left">Archivo</th>
                  <th className="py-3 px-4 text-left">Unidades Pedidas</th>
                  <th className="py-3 px-4 text-left">Unidades Distribuidas</th>
                  <th className="py-3 px-4 text-left">Unidades a Repartir</th>
                  <th className="py-3 px-4 text-left">Unidades en Stock</th>
                  <th className="py-3 px-4 text-left">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(ciDetalleData?.archivos ?? []).map((a) => (
                  <tr key={a.archivo} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-left font-medium text-slate-700">{a.archivo}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(a.pedidas)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(a.distribuidas)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(a.aRepartir)}</td>
                    <td className="py-3 px-4 text-left text-slate-600">{fmtNum(a.stock)}</td>
                    <td className="py-3 px-4 text-left">
                      <button
                        onClick={() => eliminarArchivoCI(a.archivo)}
                        disabled={eliminandoArchivoCI === a.archivo}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {eliminandoArchivoCI === a.archivo ? "Borrando..." : "Borrar archivo"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(ciDetalleData?.archivos ?? []).length === 0 && !ciDetalleLoading && (
              <p className="text-sm text-slate-400 text-center py-8">No hay archivos cargados.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonCard } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha, dotForMarca, getThemeClasses } from "@/components/dashboard/formatters";
import type { ResumenData, CanalResumen } from "./types";

export default function Resumen() {
  const { activeTab, dataVersion } = useDashboard();

  // Estados para la interactividad de las tablas en "Resumen"
  const [selectedMarca, setSelectedMarca] = useState<string | null>(null);

  const [rangoResumen, setRangoResumen] = useState<7 | 14 | 30 | null>(null); // null = todos los datos
  const [filtroTipoResumen, setFiltroTipoResumen] = useState<"TODOS" | "REMA" | "STD">("TODOS");
  // "Demanda Total": No (default) = igual que hoy, excluye OD_TERMINADO.
  // Sí = incluye también los pedidos OD_TERMINADO.
  const [filtroDemandaTotal, setFiltroDemandaTotal] = useState(false);

  const urlResumen = useMemo(() => {
    let url = "/api/resumen";
    const params = new URLSearchParams();
    if (rangoResumen) {
      const d = new Date();
      d.setDate(d.getDate() - (rangoResumen - 1));
      params.set("desde", d.toISOString().slice(0, 10));
    }
    if (filtroTipoResumen !== "TODOS") {
      params.set("tipoPedido", filtroTipoResumen);
    }
    if (filtroDemandaTotal) {
      params.set("incluirTerminados", "1");
    }
    if (params.toString()) url += `?${params.toString()}`;
    return url;
  }, [rangoResumen, filtroTipoResumen, filtroDemandaTotal]);

  const {
    data: resumenData,
    error: resumenError,
    isLoading: resumenLoading,
  } = useTabData<ResumenData>(activeTab, "Resumen", urlResumen, dataVersion);

  const kpiData = [
    { title: "Total Unidades", value: resumenData ? fmtNum(resumenData.kpis.totalUni) : "—", theme: "blue", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" /></svg> },
    { title: "Unidades Pickeadas", value: resumenData ? fmtNum(resumenData.kpis.totalPick) : "—", theme: "green", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline strokeLinecap="round" strokeLinejoin="round" points="22 4 12 14.01 9 11.01" /></svg> },
    { title: "Unidades Separadas", value: resumenData ? fmtNum(resumenData.kpis.totalSep) : "—", theme: "purple", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polygon strokeLinecap="round" strokeLinejoin="round" points="12 2 2 7 12 12 22 7 12 2" /><polyline strokeLinecap="round" strokeLinejoin="round" points="2 17 12 22 22 17" /><polyline strokeLinecap="round" strokeLinejoin="round" points="2 12 17 22 12" /></svg> },
    { title: "Pendiente Picking", value: resumenData ? fmtNum(resumenData.kpis.pendPick) : "—", theme: "orange", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle strokeLinecap="round" strokeLinejoin="round" cx="12" cy="12" r="10" /><polyline strokeLinecap="round" strokeLinejoin="round" points="12 6 12 12 16 14" /></svg> },
    { title: "Pendiente Separación", value: resumenData ? fmtNum(resumenData.kpis.pendSep) : "—", theme: "red", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="9" x2="12" y2="13" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="17" x2="12.01" y2="17" /></svg> },
    { title: "Efic. Picking", value: resumenData ? fmtPct(resumenData.kpis.eficPick) : "—", theme: "green", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polyline strokeLinecap="round" strokeLinejoin="round" points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline strokeLinecap="round" strokeLinejoin="round" points="17 6 23 6 23 12" /></svg> },
    { title: "Efic. Separación", value: resumenData ? fmtPct(resumenData.kpis.eficSep) : "—", theme: "purple", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><line strokeLinecap="round" strokeLinejoin="round" x1="18" y1="20" x2="18" y2="10" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="20" x2="12" y2="4" /><line strokeLinecap="round" strokeLinejoin="round" x1="6" y1="20" x2="6" y2="14" /></svg> },
    { title: "Total Registros", value: resumenData ? fmtNum(resumenData.kpis.totalRegistros) : "—", theme: "blue", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" /></svg> }
  ];

  const marcasData = (resumenData?.marcas ?? []).map((m, idx) => ({
    name: m.name,
    dot: dotForMarca(idx),
    uni: fmtNum(m.uni),
    pick: fmtNum(m.pick),
    sep: fmtNum(m.sep),
    pendPick: fmtNum(m.pendPick),
    pendSep: fmtNum(m.pendSep),
    eficPick: fmtPct(m.eficPick),
    eficSep: fmtPct(m.eficSep),
    reg: fmtNum(m.reg),
  }));

  const [canalRows, setCanalRows] = useState<CanalResumen[] | null>(null);
  const [canalLoading, setCanalLoading] = useState(false);
  const [canalError, setCanalError] = useState<string | null>(null);

  const cargarCanalPorMarca = async (marca: string) => {
    setCanalLoading(true);
    setCanalError(null);
    setCanalRows(null);
    try {
      let url = `/api/resumen/canal?marca=${encodeURIComponent(marca)}`;
      if (filtroTipoResumen !== "TODOS") url += `&tipoPedido=${filtroTipoResumen}`;
      if (filtroDemandaTotal) url += `&incluirTerminados=1`;
      const res = await fetch(url, {
        cache: "no-store",
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo cargar el desglose por canal.");
      }
      setCanalRows(data.canales);
    } catch (err) {
      setCanalError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCanalLoading(false);
    }
  };

  const handleMarcaClick = (marca: string) => {
    if (marca === selectedMarca) {
      setSelectedMarca(null);
      setCanalRows(null);
      setCanalError(null);
      return;
    }
    setSelectedMarca(marca);
    void cargarCanalPorMarca(marca);
  };

  // Si cambia el filtro REMA/STD o Demanda Total de Resumen mientras el
  // desglose por canal de una marca está abierto, lo recarga para que
  // muestre lo mismo que la tabla de arriba (en vez de quedarse con los
  // datos del filtro anterior).
  useEffect(() => {
    if (!selectedMarca) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarCanalPorMarca(selectedMarca);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipoResumen, filtroDemandaTotal]);

  return (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { label: "Última semana", dias: 7 as const },
                  { label: "Últimos 14 días", dias: 14 as const },
                  { label: "Último mes", dias: 30 as const },
                ]).map((opcion) => (
                  <button
                    key={opcion.dias}
                    onClick={() => setRangoResumen(opcion.dias)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      rangoResumen === opcion.dias
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {opcion.label}
                  </button>
                ))}

                <select
                  value={filtroTipoResumen}
                  onChange={(e) => setFiltroTipoResumen(e.target.value as "TODOS" | "REMA" | "STD")}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODOS">Todos los pedidos</option>
                  <option value="REMA">REMA</option>
                  <option value="STD">STD</option>
                </select>

                <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600">
                  Demanda Total
                  <select
                    value={filtroDemandaTotal ? "SI" : "NO"}
                    onChange={(e) => setFiltroDemandaTotal(e.target.value === "SI")}
                    className="bg-transparent border-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold"
                  >
                    <option value="NO">No</option>
                    <option value="SI">Sí</option>
                  </select>
                </label>

                <button
                  onClick={() => {
                    setRangoResumen(null);
                    setFiltroTipoResumen("TODOS");
                    setFiltroDemandaTotal(false);
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

              {resumenError && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el resumen: {resumenError}
                </div>
              )}
              {resumenLoading && !resumenData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              )}

              {resumenData && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(resumenData.updatedAt)}</span>
                </div>
              )}

              {/* TARJETAS KPI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiData.map((kpi, index) => {
                  const themeClasses = getThemeClasses(kpi.theme);
                  return (
                    <div key={index} className="relative overflow-hidden bg-white rounded-xl border border-slate-200 p-5 h-32 flex flex-col justify-center">
                      <div className={`absolute -right-8 -bottom-12 w-40 h-40 rounded-[100%] ${themeClasses.blob} opacity-80`}></div>
                      <div className="relative z-10 w-full flex justify-between items-center">
                        <div>
                          <h3 className="text-sm font-medium text-slate-500 mb-1">{kpi.title}</h3>
                          <p className={`text-[32px] font-bold tracking-tight ${themeClasses.text} leading-none`}>{kpi.value}</p>
                        </div>
                        <div className={`w-[46px] h-[46px] rounded-xl flex items-center justify-center ${themeClasses.bgIcon} ${themeClasses.textIcon}`}>{kpi.icon}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TABLA MARCAS */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800">Detalle por Marca</h2>
                <p className="text-sm text-slate-500 mb-6">Haz click en una marca para ver el desglose por canal</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Marca</th>
                        <th className="py-3 px-4 text-left">Unidades</th>
                        <th className="py-3 px-4 text-left">Pickeadas</th>
                        <th className="py-3 px-4 text-left">Separadas</th>
                        <th className="py-3 px-4 text-left">Pend. Picking</th>
                        <th className="py-3 px-4 text-left">Pend. Sep.</th>
                        <th className="py-3 px-4 text-left">Efic. Pick.</th>
                        <th className="py-3 px-4 text-left">Efic. Sep.</th>
                        <th className="py-3 px-4 text-left">Registros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {marcasData.map((marca, i) => (
                        <tr key={i} onClick={() => handleMarcaClick(marca.name)} className={`cursor-pointer transition-colors ${selectedMarca === marca.name ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                          <td className="py-3 px-4 text-left flex items-center gap-3 font-semibold text-slate-800"><span className={`w-2.5 h-2.5 rounded-full ${marca.dot}`}></span> {marca.name}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.uni}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.pick}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.sep}</td>
                          <td className="py-3 px-4 text-left font-semibold text-orange-500">{marca.pendPick}</td>
                          <td className="py-3 px-4 text-left font-semibold text-red-500">{marca.pendSep}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.eficPick}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.eficSep}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.reg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DESGLOSE POR CANAL (al hacer click en una marca) */}
              {selectedMarca && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-800">
                    Desglose por Canal — {selectedMarca}
                  </h2>
                  <p className="text-sm text-slate-500 mb-6">
                    Canal de venta de cada pedido, según la tienda destino asociada.
                  </p>

                  {canalLoading && (
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                      Cargando desglose por canal...
                    </div>
                  )}

                  {canalError && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      Error al cargar el desglose: {canalError}
                    </div>
                  )}

                  {!canalLoading && !canalError && canalRows && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-slate-500 font-medium border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4 text-left">Canal</th>
                            <th className="py-3 px-4 text-left">Unidades</th>
                            <th className="py-3 px-4 text-left">Pickeadas</th>
                            <th className="py-3 px-4 text-left">Separadas</th>
                            <th className="py-3 px-4 text-left">Pend. Picking</th>
                            <th className="py-3 px-4 text-left">Pend. Sep.</th>
                            <th className="py-3 px-4 text-left">Efic. Pick.</th>
                            <th className="py-3 px-4 text-left">Efic. Sep.</th>
                            <th className="py-3 px-4 text-left">Registros</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {canalRows.map((canal, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-left flex items-center gap-3 font-semibold text-slate-800">
                                <span className={`w-2.5 h-2.5 rounded-full ${dotForMarca(i)}`}></span>
                                {canal.name}
                              </td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.uni)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.pick)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.sep)}</td>
                              <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(canal.pendPick)}</td>
                              <td className="py-3 px-4 text-left font-semibold text-red-500">{fmtNum(canal.pendSep)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtPct(canal.eficPick)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtPct(canal.eficSep)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.reg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
  );
}

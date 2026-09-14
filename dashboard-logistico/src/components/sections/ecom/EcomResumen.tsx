"use client";

import { useEffect, useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonCard } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha, dotForMarca, getThemeClasses, semanasConDatosDe } from "@/components/dashboard/formatters";
import type { ResumenEcomData, CanalResumenEcom } from "./types";

export default function EcomResumen() {
  const { activeTab, dataVersion } = useDashboard();

  const [rangoResumenEcom, setRangoResumenEcom] = useState<7 | 14 | 30 | null>(null);
  const [semanaResumenEcom, setSemanaResumenEcom] = useState<{ desde: string; hasta: string } | null>(null);
  const [selectedMarcaEcom, setSelectedMarcaEcom] = useState<string | null>(null);
  // "Demanda Total": No (default) = excluye solo OD_DESPACHADO/OD_CARGA_CAMION
  // (OD_CANCELADA/OD_RECIBIDO_DEV ya cuentan siempre en Resumen). Sí = no
  // excluye ningún estado.
  const [filtroDemandaTotalEcom, setFiltroDemandaTotalEcom] = useState(false);

  const urlResumenEcom = useMemo(() => {
    let url = "/api/ecom/resumen";
    const params = new URLSearchParams();
    if (semanaResumenEcom) {
      params.set("desde", semanaResumenEcom.desde);
      params.set("hasta", semanaResumenEcom.hasta);
    } else if (rangoResumenEcom) {
      const d = new Date();
      d.setDate(d.getDate() - (rangoResumenEcom - 1));
      params.set("desde", d.toISOString().slice(0, 10));
    }
    if (filtroDemandaTotalEcom) {
      params.set("incluirTodos", "1");
    }
    if (params.toString()) url += `?${params.toString()}`;
    return url;
  }, [rangoResumenEcom, semanaResumenEcom, filtroDemandaTotalEcom]);

  const {
    data: resumenEcomData,
    error: resumenEcomError,
    isLoading: resumenEcomLoading,
  } = useTabData<ResumenEcomData>(activeTab, "ECOM-Resumen", urlResumenEcom, dataVersion);

  // Semanas para el selector de Resumen -- calculadas sobre las fechas que
  // devuelve la propia API (fechasDisponibles), no sobre los datos de Por
  // Fecha/Por Pedidos (que solo se piden cuando esas pestañas están activas).
  const semanasConDatosResumenEcom = semanasConDatosDe(resumenEcomData?.fechasDisponibles ?? []);

  const marcasDataEcom = (resumenEcomData?.marcas ?? []).map((m, idx) => ({
    name: m.name,
    dot: dotForMarca(idx),
    uni: fmtNum(m.uni),
    pick: fmtNum(m.pick),
    sep: fmtNum(m.sep),
    pendPick: fmtNum(m.pendPick),
    pendSep: fmtNum(m.pendSep),
    unidadesCanceladasPorClientes: fmtNum(m.unidadesCanceladasPorClientes),
    unidadesCanceladasSinStock: fmtNum(m.unidadesCanceladasSinStock),
    porcentajeCancelaciones: `${m.porcentajeCancelaciones.toFixed(2)}%`,
    cantidadPedidos: fmtNum(m.cantidadPedidos),
  }));

  const [canalRowsEcom, setCanalRowsEcom] = useState<CanalResumenEcom[] | null>(null);
  const [canalLoadingEcom, setCanalLoadingEcom] = useState(false);
  const [canalErrorEcom, setCanalErrorEcom] = useState<string | null>(null);

  const cargarCanalPorMarcaEcom = async (marca: string) => {
    setCanalLoadingEcom(true);
    setCanalErrorEcom(null);
    setCanalRowsEcom(null);
    try {
      let url = `/api/ecom/resumen/canal?marca=${encodeURIComponent(marca)}`;
      if (filtroDemandaTotalEcom) url += `&incluirTodos=1`;
      if (semanaResumenEcom) {
        url += `&desde=${semanaResumenEcom.desde}&hasta=${semanaResumenEcom.hasta}`;
      } else if (rangoResumenEcom) {
        const d = new Date();
        d.setDate(d.getDate() - (rangoResumenEcom - 1));
        url += `&desde=${d.toISOString().slice(0, 10)}`;
      }
      const res = await fetch(url, { cache: "no-store" });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo cargar el desglose por canal.");
      }
      setCanalRowsEcom(data.canales);
    } catch (err) {
      setCanalErrorEcom(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCanalLoadingEcom(false);
    }
  };

  const handleMarcaClickEcom = (marca: string) => {
    if (marca === selectedMarcaEcom) {
      setSelectedMarcaEcom(null);
      setCanalRowsEcom(null);
      setCanalErrorEcom(null);
      return;
    }
    setSelectedMarcaEcom(marca);
    void cargarCanalPorMarcaEcom(marca);
  };

  // Si cambia "Demanda Total", el rango de fecha o la semana mientras el
  // desglose por canal de una marca está abierto, lo recarga para que
  // coincida con la tabla de arriba.
  useEffect(() => {
    if (!selectedMarcaEcom) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarCanalPorMarcaEcom(selectedMarcaEcom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroDemandaTotalEcom, rangoResumenEcom, semanaResumenEcom]);

  const kpiDataEcom = [
    { title: "Total Unidades", value: resumenEcomData ? fmtNum(resumenEcomData.kpis.totalUni) : "—", theme: "blue", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" /></svg> },
    { title: "Unidades Pickeadas", value: resumenEcomData ? fmtNum(resumenEcomData.kpis.totalPick) : "—", theme: "green", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline strokeLinecap="round" strokeLinejoin="round" points="22 4 12 14.01 9 11.01" /></svg> },
    { title: "Unidades Separadas", value: resumenEcomData ? fmtNum(resumenEcomData.kpis.totalSep) : "—", theme: "purple", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polygon strokeLinecap="round" strokeLinejoin="round" points="12 2 2 7 12 12 22 7 12 2" /><polyline strokeLinecap="round" strokeLinejoin="round" points="2 17 12 22 22 17" /><polyline strokeLinecap="round" strokeLinejoin="round" points="2 12 17 22 12" /></svg> },
    { title: "Pendiente Picking", value: resumenEcomData ? fmtNum(resumenEcomData.kpis.pendPick) : "—", theme: "orange", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle strokeLinecap="round" strokeLinejoin="round" cx="12" cy="12" r="10" /><polyline strokeLinecap="round" strokeLinejoin="round" points="12 6 12 12 16 14" /></svg> },
    { title: "Pendiente Separación", value: resumenEcomData ? fmtNum(resumenEcomData.kpis.pendSep) : "—", theme: "red", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="9" x2="12" y2="13" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="17" x2="12.01" y2="17" /></svg> },
    { title: "Unidades Canceladas por Clientes", value: resumenEcomData ? fmtNum(resumenEcomData.kpis.unidadesCanceladasPorClientes) : "—", theme: "green", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle strokeLinecap="round" strokeLinejoin="round" cx="12" cy="12" r="10" /><line strokeLinecap="round" strokeLinejoin="round" x1="15" y1="9" x2="9" y2="15" /><line strokeLinecap="round" strokeLinejoin="round" x1="9" y1="9" x2="15" y2="15" /></svg> },
    { title: "Unidades Canceladas sin stock", value: resumenEcomData ? fmtNum(resumenEcomData.kpis.unidadesCanceladasSinStock) : "—", theme: "purple", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle strokeLinecap="round" strokeLinejoin="round" cx="12" cy="12" r="10" /><line strokeLinecap="round" strokeLinejoin="round" x1="15" y1="9" x2="9" y2="15" /><line strokeLinecap="round" strokeLinejoin="round" x1="9" y1="9" x2="15" y2="15" /></svg> },
    { title: "Cantidad de Pedidos", value: resumenEcomData ? fmtNum(resumenEcomData.kpis.cantidadPedidos) : "—", theme: "blue", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline strokeLinecap="round" strokeLinejoin="round" points="3.27 6.96 12 12.01 20.73 6.96" /><line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="22.08" x2="12" y2="12" /></svg> }
  ];

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
                    onClick={() => {
                      setRangoResumenEcom(opcion.dias);
                      setSemanaResumenEcom(null);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      !semanaResumenEcom && rangoResumenEcom === opcion.dias
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {opcion.label}
                  </button>
                ))}

                <select
                  value={semanaResumenEcom ? semanaResumenEcom.desde : ""}
                  onChange={(e) => {
                    const semana = semanasConDatosResumenEcom.find((s) => s.desde === e.target.value);
                    if (semana) {
                      setSemanaResumenEcom({ desde: semana.desde, hasta: semana.hasta });
                      setRangoResumenEcom(null);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    semanaResumenEcom ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <option value="">Semana del año...</option>
                  {semanasConDatosResumenEcom.map((s) => (
                    <option key={s.desde} value={s.desde}>{s.label}</option>
                  ))}
                </select>

                <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600">
                  Demanda Total
                  <select
                    value={filtroDemandaTotalEcom ? "SI" : "NO"}
                    onChange={(e) => setFiltroDemandaTotalEcom(e.target.value === "SI")}
                    className="bg-transparent border-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold"
                  >
                    <option value="NO">No</option>
                    <option value="SI">Sí</option>
                  </select>
                </label>

                <button
                  onClick={() => {
                    setRangoResumenEcom(null);
                    setSemanaResumenEcom(null);
                    setFiltroDemandaTotalEcom(false);
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

              {resumenEcomError && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el resumen: {resumenEcomError}
                </div>
              )}
              {resumenEcomLoading && !resumenEcomData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              )}

              {resumenEcomData && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(resumenEcomData.updatedAt)}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiDataEcom.map((kpi, index) => {
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
                        <th className="py-3 px-4 text-left">Unidades Canceladas por Clientes</th>
                        <th className="py-3 px-4 text-left">Unidades Canceladas sin stock</th>
                        <th className="py-3 px-4 text-left">% Cancelaciones</th>
                        <th className="py-3 px-4 text-left">Cantidad de Pedidos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {marcasDataEcom.map((marca, i) => (
                        <tr key={i} onClick={() => handleMarcaClickEcom(marca.name)} className={`cursor-pointer transition-colors ${selectedMarcaEcom === marca.name ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                          <td className="py-3 px-4 text-left flex items-center gap-3 font-semibold text-slate-800"><span className={`w-2.5 h-2.5 rounded-full ${marca.dot}`}></span> {marca.name}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.uni}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.pick}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.sep}</td>
                          <td className="py-3 px-4 text-left font-semibold text-orange-500">{marca.pendPick}</td>
                          <td className="py-3 px-4 text-left font-semibold text-red-500">{marca.pendSep}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.unidadesCanceladasPorClientes}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.unidadesCanceladasSinStock}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.porcentajeCancelaciones}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{marca.cantidadPedidos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedMarcaEcom && (
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-800">
                    Desglose por Canal — {selectedMarcaEcom}
                  </h2>
                  <p className="text-sm text-slate-500 mb-6">
                    Canal de venta de cada pedido, según &quot;OOLL asignado&quot;.
                  </p>

                  {canalLoadingEcom && (
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-500">
                      Cargando desglose por canal...
                    </div>
                  )}

                  {canalErrorEcom && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      Error al cargar el desglose: {canalErrorEcom}
                    </div>
                  )}

                  {!canalLoadingEcom && !canalErrorEcom && canalRowsEcom && (
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
                            <th className="py-3 px-4 text-left">Unidades Canceladas por Clientes</th>
                            <th className="py-3 px-4 text-left">Unidades Canceladas sin stock</th>
                            <th className="py-3 px-4 text-left">% Cancelaciones</th>
                            <th className="py-3 px-4 text-left">Cantidad de Pedidos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {canalRowsEcom.map((canal, i) => (
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
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.unidadesCanceladasPorClientes)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.unidadesCanceladasSinStock)}</td>
                              <td className="py-3 px-4 text-left text-slate-600">{canal.porcentajeCancelaciones.toFixed(2)}%</td>
                              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(canal.cantidadPedidos)}</td>
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

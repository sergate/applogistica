"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha, semanasConDatosDe } from "@/components/dashboard/formatters";
import type { PedidoResumenEcom } from "./types";

export default function EcomPorPedidos() {
  const { activeTab, dataVersion } = useDashboard();

  const {
    data: pedidosEcomData,
    error: pedidosEcomError,
    isLoading: pedidosEcomLoading,
  } = useTabData<{ filas: PedidoResumenEcom[]; updatedAt: string | null }>(
    activeTab,
    "ECOM-PorPedidos",
    "/api/ecom/resumen/pedidos",
    dataVersion
  );

  const semanasConDatosPedidosEcom = semanasConDatosDe((pedidosEcomData?.filas ?? []).map((f) => f.fecha));

  const [busquedaPedidosEcom, setBusquedaPedidosEcom] = useState("");
  const [filtroMarcaPedidosEcom, setFiltroMarcaPedidosEcom] = useState("TODAS");
  const [filtroCanalPedidosEcom, setFiltroCanalPedidosEcom] = useState("TODAS");
  const [rangoFechaPedidosEcom, setRangoFechaPedidosEcom] = useState<7 | 14 | 30>(7);
  const [semanaPedidosEcom, setSemanaPedidosEcom] = useState<{ desde: string; hasta: string } | null>(null);

  const hoyPedidosISOEcom = new Date().toISOString().slice(0, 10);
  const limitePedidosISOEcom = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangoFechaPedidosEcom - 1));
    return d.toISOString().slice(0, 10);
  })();

  const marcasDisponiblesPedidosEcom = Array.from(new Set((pedidosEcomData?.filas ?? []).map((f) => f.marca))).sort();
  const canalesDisponiblesPedidosEcom = Array.from(new Set((pedidosEcomData?.filas ?? []).map((f) => f.canal))).sort();

  const busquedaNormalizadaEcom = busquedaPedidosEcom.trim().toLowerCase();

  const { filasFiltradasPedidosEcom, subtotalPedidosEcomCalculado } = useMemo(() => {
    const filasFiltradasPedidosEcom = (pedidosEcomData?.filas ?? []).filter((f) => {
      const enRango = semanaPedidosEcom
        ? f.fecha !== "SIN FECHA" && f.fecha >= semanaPedidosEcom.desde && f.fecha <= semanaPedidosEcom.hasta
        : f.fecha !== "SIN FECHA" && f.fecha >= limitePedidosISOEcom && f.fecha <= hoyPedidosISOEcom;
      if (!enRango) return false;
      if (filtroMarcaPedidosEcom !== "TODAS" && f.marca !== filtroMarcaPedidosEcom) return false;
      if (filtroCanalPedidosEcom !== "TODAS" && f.canal !== filtroCanalPedidosEcom) return false;
      if (busquedaNormalizadaEcom) {
        const matchPedido = f.pedido.toLowerCase().includes(busquedaNormalizadaEcom);
        if (!matchPedido) return false;
      }
      return true;
    });

    const subtotal = filasFiltradasPedidosEcom.reduce(
      (acc, f) => ({ uni: acc.uni + f.uni, pick: acc.pick + f.pick, sep: acc.sep + f.sep }),
      { uni: 0, pick: 0, sep: 0 }
    );
    const subtotalPedidosEcomCalculado = {
      ...subtotal,
      pendPick: subtotal.uni - subtotal.pick,
      pendSep: subtotal.uni - subtotal.sep,
      eficPick: subtotal.uni > 0 ? (subtotal.pick / subtotal.uni) * 100 : 0,
      eficSep: subtotal.uni > 0 ? (subtotal.sep / subtotal.uni) * 100 : 0,
    };

    return { filasFiltradasPedidosEcom, subtotalPedidosEcomCalculado };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pedidosEcomData,
    semanaPedidosEcom,
    limitePedidosISOEcom,
    hoyPedidosISOEcom,
    filtroMarcaPedidosEcom,
    filtroCanalPedidosEcom,
    busquedaNormalizadaEcom,
  ]);

  const exportarPedidosEcomAExcel = async () => {
    const XLSX = await import("xlsx");
    const filasExport = filasFiltradasPedidosEcom.map((f) => ({
      "N° Pedido": f.pedido,
      Marca: f.marca,
      Canal: f.canal,
      Sector: f.sector,
      Fecha: f.fecha,
      Unidades: f.uni,
      Pickeadas: f.pick,
      Separadas: f.sep,
      "Pend. Pick": f.pendPick,
      "Pend. Sep": f.pendSep,
      "Efic Pick %": Number(f.eficPick.toFixed(1)),
      "Efic Sep %": Number(f.eficSep.toFixed(1)),
    }));
    const hoja = XLSX.utils.json_to_sheet(filasExport);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Ecom - Por Pedidos");
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(libro, `pedidos_ecom_${fechaArchivo}.xlsx`);
  };

  return (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-xl font-bold text-slate-800">Detalle por Pedidos (Ecom)</h2>
                {pedidosEcomData && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(pedidosEcomData.updatedAt)}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input
                  type="text"
                  value={busquedaPedidosEcom}
                  onChange={(e) => setBusquedaPedidosEcom(e.target.value)}
                  placeholder="Buscar por número de pedido..."
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 min-w-[260px]"
                />

                <select
                  value={filtroMarcaPedidosEcom}
                  onChange={(e) => setFiltroMarcaPedidosEcom(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todas las marcas</option>
                  {marcasDisponiblesPedidosEcom.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <select
                  value={filtroCanalPedidosEcom}
                  onChange={(e) => setFiltroCanalPedidosEcom(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los canales</option>
                  {canalesDisponiblesPedidosEcom.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <button
                  onClick={exportarPedidosEcomAExcel}
                  disabled={filasFiltradasPedidosEcom.length === 0}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ml-auto ${
                    filasFiltradasPedidosEcom.length === 0
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline strokeLinecap="round" strokeLinejoin="round" points="7 10 12 15 17 10" />
                    <line strokeLinecap="round" strokeLinejoin="round" x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Exportar a Excel
                </button>
              </div>

              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {([
                  { label: "Última semana", dias: 7 as const },
                  { label: "Últimos 14 días", dias: 14 as const },
                  { label: "Último mes", dias: 30 as const },
                ]).map((opcion) => (
                  <button
                    key={opcion.dias}
                    onClick={() => {
                      setRangoFechaPedidosEcom(opcion.dias);
                      setSemanaPedidosEcom(null);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      !semanaPedidosEcom && rangoFechaPedidosEcom === opcion.dias
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {opcion.label}
                  </button>
                ))}

                <select
                  value={semanaPedidosEcom ? semanaPedidosEcom.desde : ""}
                  onChange={(e) => {
                    const semana = semanasConDatosPedidosEcom.find((s) => s.desde === e.target.value);
                    if (semana) setSemanaPedidosEcom({ desde: semana.desde, hasta: semana.hasta });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    semanaPedidosEcom ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <option value="">Semana del año...</option>
                  {semanasConDatosPedidosEcom.map((s) => (
                    <option key={s.desde} value={s.desde}>{s.label}</option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setRangoFechaPedidosEcom(7);
                    setSemanaPedidosEcom(null);
                    setFiltroMarcaPedidosEcom("TODAS");
                    setFiltroCanalPedidosEcom("TODAS");
                    setBusquedaPedidosEcom("");
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

              {pedidosEcomError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el detalle por pedidos: {pedidosEcomError}
                </div>
              )}
              {pedidosEcomLoading && !pedidosEcomData && (
                <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
                  <SkeletonTable rows={6} columns={6} />
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                {[
                  { label: "Unidades", value: fmtNum(subtotalPedidosEcomCalculado.uni), color: "text-slate-800" },
                  { label: "Pickeado", value: fmtNum(subtotalPedidosEcomCalculado.pick), color: "text-slate-800" },
                  { label: "Separado", value: fmtNum(subtotalPedidosEcomCalculado.sep), color: "text-slate-800" },
                  { label: "Pend. Pick", value: fmtNum(subtotalPedidosEcomCalculado.pendPick), color: "text-orange-600" },
                  { label: "Pend. Sep.", value: fmtNum(subtotalPedidosEcomCalculado.pendSep), color: "text-red-600" },
                ].map((card) => (
                  <div key={card.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-xs font-medium text-slate-500 mb-2">{card.label}</p>
                    <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-4 px-4 text-left">N° Pedido</th>
                      <th className="py-4 px-4 text-left">Marca</th>
                      <th className="py-4 px-4 text-left">Canal</th>
                      <th className="py-4 px-4 text-left">Sector</th>
                      <th className="py-4 px-4 text-left">Unidades</th>
                      <th className="py-4 px-4 text-left">Pickeadas</th>
                      <th className="py-4 px-4 text-left">Separadas</th>
                      <th className="py-4 px-4 text-left">Pend. Pick</th>
                      <th className="py-4 px-4 text-left">Pend. Sep</th>
                      <th className="py-4 px-4 text-left">Efic. Pick %</th>
                      <th className="py-4 px-4 text-left">Efic. Sep %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filasFiltradasPedidosEcom.map((row, i) => (
                      <tr key={`${row.pedido}-${i}`} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 text-left font-semibold text-slate-800">{row.pedido}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.marca}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.canal}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.sector}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.uni)}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.pick)}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.sep)}</td>
                        <td className="py-4 px-4 text-left font-semibold text-orange-500">{fmtNum(row.pendPick)}</td>
                        <td className="py-4 px-4 text-left font-semibold text-red-500">{fmtNum(row.pendSep)}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{fmtPct(row.eficPick)}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{fmtPct(row.eficSep)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filasFiltradasPedidosEcom.length === 0 && !pedidosEcomLoading && (
                  <p className="text-sm text-slate-400 text-center py-8">No hay pedidos que coincidan con los filtros aplicados.</p>
                )}
              </div>
            </div>
  );
}

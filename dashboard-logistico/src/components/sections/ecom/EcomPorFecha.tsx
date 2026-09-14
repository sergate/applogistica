"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha, dotForMarcaName, semanasConDatosDe } from "@/components/dashboard/formatters";
import type { FechaResumenEcom } from "./types";

export default function EcomPorFecha() {
  const { activeTab, dataVersion } = useDashboard();

  const [rangoFechaEcom, setRangoFechaEcom] = useState<7 | 14 | 30>(7);
  const [fechaSeleccionadaEcom, setFechaSeleccionadaEcom] = useState<string>("");
  const [semanaFechaEcom, setSemanaFechaEcom] = useState<{ desde: string; hasta: string } | null>(null);
  const [filtroMarcaFechaEcom, setFiltroMarcaFechaEcom] = useState<string>("TODAS");
  const [filtroCanalFechaEcom, setFiltroCanalFechaEcom] = useState<string>("TODAS");

  const {
    data: fechaEcomData,
    error: fechaEcomError,
    isLoading: fechaEcomLoading,
  } = useTabData<{ filas: FechaResumenEcom[]; updatedAt: string | null }>(
    activeTab,
    "ECOM-PorFecha",
    "/api/ecom/resumen/por-fecha",
    dataVersion
  );

  const semanasConDatosEcom = semanasConDatosDe((fechaEcomData?.filas ?? []).map((f) => f.fecha));

  const hoyISOEcom = new Date().toISOString().slice(0, 10);
  const limiteFechaISOEcom = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangoFechaEcom - 1));
    return d.toISOString().slice(0, 10);
  })();

  const marcasDisponiblesFechaEcom = Array.from(new Set((fechaEcomData?.filas ?? []).map((f) => f.marca))).sort();
  const canalesDisponiblesFechaEcom = Array.from(new Set((fechaEcomData?.filas ?? []).map((f) => f.canal))).sort();

  const { fechasDataEcom, subtotalFechaEcomCalculado } = useMemo(() => {
    const filasConFecha = (fechaEcomData?.filas ?? []).filter((f) => {
      if (f.fecha === "SIN FECHA") return false;
      if (semanaFechaEcom) return f.fecha >= semanaFechaEcom.desde && f.fecha <= semanaFechaEcom.hasta;
      if (fechaSeleccionadaEcom) return f.fecha === fechaSeleccionadaEcom;
      return f.fecha >= limiteFechaISOEcom && f.fecha <= hoyISOEcom;
    });
    const filasSinFecha =
      rangoFechaEcom === 30 && !fechaSeleccionadaEcom && !semanaFechaEcom
        ? (fechaEcomData?.filas ?? []).filter((f) => f.fecha === "SIN FECHA")
        : [];

    const filasFiltradas = [...filasConFecha, ...filasSinFecha].filter(
      (f) =>
        (filtroMarcaFechaEcom === "TODAS" || f.marca === filtroMarcaFechaEcom) &&
        (filtroCanalFechaEcom === "TODAS" || f.canal === filtroCanalFechaEcom)
    );

    const consolidadoPorFechaMarca = new Map<
      string,
      { fecha: string; marca: string; uni: number; pick: number; sep: number }
    >();
    for (const f of filasFiltradas) {
      const key = `${f.fecha}__${f.marca}`;
      if (!consolidadoPorFechaMarca.has(key)) {
        consolidadoPorFechaMarca.set(key, { fecha: f.fecha, marca: f.marca, uni: 0, pick: 0, sep: 0 });
      }
      const acc = consolidadoPorFechaMarca.get(key)!;
      acc.uni += f.uni;
      acc.pick += f.pick;
      acc.sep += f.sep;
    }

    const fechasDataEcom = Array.from(consolidadoPorFechaMarca.values())
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.uni - a.uni))
      .map((f) => ({
        fecha: f.fecha,
        marca: f.marca,
        dot: dotForMarcaName(f.marca),
        uni: fmtNum(f.uni),
        pick: fmtNum(f.pick),
        sep: fmtNum(f.sep),
        pendPick: fmtNum(f.uni - f.pick),
        pendSep: fmtNum(f.uni - f.sep),
        eficPick: fmtPct(f.uni > 0 ? (f.pick / f.uni) * 100 : 0),
        eficSep: fmtPct(f.uni > 0 ? (f.sep / f.uni) * 100 : 0),
      }));

    const subtotalFecha = filasFiltradas.reduce(
      (acc, f) => ({ uni: acc.uni + f.uni, pick: acc.pick + f.pick, sep: acc.sep + f.sep }),
      { uni: 0, pick: 0, sep: 0 }
    );
    const subtotalFechaEcomCalculado = {
      ...subtotalFecha,
      pendPick: subtotalFecha.uni - subtotalFecha.pick,
      pendSep: subtotalFecha.uni - subtotalFecha.sep,
      eficPick: subtotalFecha.uni > 0 ? (subtotalFecha.pick / subtotalFecha.uni) * 100 : 0,
      eficSep: subtotalFecha.uni > 0 ? (subtotalFecha.sep / subtotalFecha.uni) * 100 : 0,
    };

    return { fechasDataEcom, subtotalFechaEcomCalculado };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaEcomData, rangoFechaEcom, fechaSeleccionadaEcom, semanaFechaEcom, filtroMarcaFechaEcom, filtroCanalFechaEcom, hoyISOEcom, limiteFechaISOEcom]);

  return (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-slate-800">Detalle por Fecha (Ecom)</h2>
                {fechaEcomData && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(fechaEcomData.updatedAt)}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                  {([
                    { label: "Última semana", dias: 7 as const },
                    { label: "Últimos 14 días", dias: 14 as const },
                    { label: "Último mes", dias: 30 as const },
                  ]).map((opcion) => (
                    <button
                      key={opcion.dias}
                      onClick={() => {
                        setRangoFechaEcom(opcion.dias);
                        setFechaSeleccionadaEcom("");
                        setSemanaFechaEcom(null);
                      }}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        !fechaSeleccionadaEcom && !semanaFechaEcom && rangoFechaEcom === opcion.dias
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {opcion.label}
                    </button>
                  ))}
                </div>

                <input
                  type="date"
                  value={fechaSeleccionadaEcom}
                  onChange={(e) => {
                    setFechaSeleccionadaEcom(e.target.value);
                    setSemanaFechaEcom(null);
                  }}
                  max={hoyISOEcom}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    fechaSeleccionadaEcom ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                />

                <select
                  value={semanaFechaEcom ? semanaFechaEcom.desde : ""}
                  onChange={(e) => {
                    const semana = semanasConDatosEcom.find((s) => s.desde === e.target.value);
                    if (semana) {
                      setSemanaFechaEcom({ desde: semana.desde, hasta: semana.hasta });
                      setFechaSeleccionadaEcom("");
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    semanaFechaEcom ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <option value="">Semana del año...</option>
                  {semanasConDatosEcom.map((s) => (
                    <option key={s.desde} value={s.desde}>{s.label}</option>
                  ))}
                </select>

                <select
                  value={filtroMarcaFechaEcom}
                  onChange={(e) => setFiltroMarcaFechaEcom(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todas las marcas</option>
                  {marcasDisponiblesFechaEcom.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <select
                  value={filtroCanalFechaEcom}
                  onChange={(e) => setFiltroCanalFechaEcom(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los canales</option>
                  {canalesDisponiblesFechaEcom.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setRangoFechaEcom(7);
                    setFechaSeleccionadaEcom("");
                    setSemanaFechaEcom(null);
                    setFiltroMarcaFechaEcom("TODAS");
                    setFiltroCanalFechaEcom("TODAS");
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

              {fechaEcomError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el detalle por fecha: {fechaEcomError}
                </div>
              )}
              {fechaEcomLoading && !fechaEcomData && (
                <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
                  <SkeletonTable rows={6} columns={5} />
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead>
                    {fechasDataEcom.length > 0 && (
                      <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                        <td className="py-3 px-4 text-left" colSpan={2}>
                          Subtotal
                          {filtroMarcaFechaEcom !== "TODAS" ? ` — ${filtroMarcaFechaEcom}` : " — Todas las marcas"}
                          {filtroCanalFechaEcom !== "TODAS" ? ` — ${filtroCanalFechaEcom}` : ""}
                        </td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaEcomCalculado.uni)}</td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaEcomCalculado.pick)}</td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaEcomCalculado.sep)}</td>
                        <td className="py-3 px-4 text-left text-orange-600">{fmtNum(subtotalFechaEcomCalculado.pendPick)}</td>
                        <td className="py-3 px-4 text-left text-red-600">{fmtNum(subtotalFechaEcomCalculado.pendSep)}</td>
                        <td className="py-3 px-4 text-left">{fmtPct(subtotalFechaEcomCalculado.eficPick)}</td>
                        <td className="py-3 px-4 text-left">{fmtPct(subtotalFechaEcomCalculado.eficSep)}</td>
                      </tr>
                    )}
                    <tr className="text-slate-500 font-medium border-b border-slate-200">
                      <th className="py-4 px-4 text-left">Fecha</th>
                      <th className="py-4 px-4 text-left">Marca</th>
                      <th className="py-4 px-4 text-left">Unidades</th>
                      <th className="py-4 px-4 text-left">Pickeadas</th>
                      <th className="py-4 px-4 text-left">Separadas</th>
                      <th className="py-4 px-4 text-left">Pend. Picking</th>
                      <th className="py-4 px-4 text-left">Pend. Sep.</th>
                      <th className="py-4 px-4 text-left">Efic. Pick.</th>
                      <th className="py-4 px-4 text-left">Efic. Sep.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fechasDataEcom.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-4 text-left text-slate-600 font-medium">{row.fecha}</td>
                        <td className="py-4 px-4 text-left flex items-center gap-3 font-bold text-slate-900"><span className={`w-2 h-2 rounded-full ${row.dot}`}></span>{row.marca}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.uni}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.pick}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.sep}</td>
                        <td className="py-4 px-4 text-left font-semibold text-orange-500">{row.pendPick}</td>
                        <td className="py-4 px-4 text-left font-semibold text-red-500">{row.pendSep}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.eficPick}</td>
                        <td className="py-4 px-4 text-left text-slate-600">{row.eficSep}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha, dotForMarcaName, semanasConDatosDe } from "@/components/dashboard/formatters";
import type { FechaResumen } from "./types";

export default function PorFecha() {
  const { activeTab, dataVersion } = useDashboard();

  const [rangoFecha, setRangoFecha] = useState<7 | 14 | 30>(7);
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>("");
  const [semanaFecha, setSemanaFecha] = useState<{ desde: string; hasta: string } | null>(null);
  const [filtroMarcaFecha, setFiltroMarcaFecha] = useState<string>("TODAS");
  const [filtroCanalFecha, setFiltroCanalFecha] = useState<string>("TODAS");
  const [filtroGrupoFecha, setFiltroGrupoFecha] = useState<string>("TODAS");
  const [filtroTipoFecha, setFiltroTipoFecha] = useState<"TODOS" | "REMA" | "STD">("TODOS");

  const {
    data: fechaData,
    error: fechaError,
    isLoading: fechaLoading,
  } = useTabData<{ filas: FechaResumen[]; updatedAt: string | null }>(
    activeTab,
    "Por fecha",
    "/api/resumen/por-fecha",
    dataVersion
  );

  // Solo mostramos en el desplegable las semanas que efectivamente tienen
  // datos cargados (según el rango real de fechas en grupo_pedidos), en vez
  // de generar las ~52 semanas de todo el año.
  const semanasConDatos = semanasConDatosDe((fechaData?.filas ?? []).map((f) => f.fecha));

  const hoyISO = new Date().toISOString().slice(0, 10);
  const limiteFechaISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangoFecha - 1)); // incluye el día de hoy dentro del rango
    return d.toISOString().slice(0, 10);
  })();

  // Lista de marcas, canales y grupos disponibles para los filtros (únicas, ordenadas)
  const marcasDisponiblesFecha = Array.from(
    new Set((fechaData?.filas ?? []).map((f) => f.marca))
  ).sort();
  const canalesDisponiblesFecha = Array.from(
    new Set((fechaData?.filas ?? []).map((f) => f.canal))
  ).sort();
  const gruposDisponiblesFecha = Array.from(
    new Set((fechaData?.filas ?? []).map((f) => f.grupo))
  ).sort();

  // Filtrado + consolidación por (fecha, marca) + subtotal -- se recalcula
  // solo cuando cambian los datos o los filtros de esta pestaña, no en
  // cualquier render del componente.
  const { fechasData, subtotalFechaCalculado } = useMemo(() => {
    const filasConFecha = (fechaData?.filas ?? []).filter((f) => {
      if (f.fecha === "SIN FECHA") return false;
      if (semanaFecha) return f.fecha >= semanaFecha.desde && f.fecha <= semanaFecha.hasta;
      if (fechaSeleccionada) return f.fecha === fechaSeleccionada;
      return f.fecha >= limiteFechaISO && f.fecha <= hoyISO;
    });
    // Los pedidos sin fecha_creacion solo se muestran en el filtro "Último mes"
    // (y no cuando se eligió una fecha puntual o una semana), siempre al final de la tabla.
    const filasSinFecha =
      rangoFecha === 30 && !fechaSeleccionada && !semanaFecha
        ? (fechaData?.filas ?? []).filter((f) => f.fecha === "SIN FECHA")
        : [];

    const filasFiltradas = [...filasConFecha, ...filasSinFecha].filter(
      (f) =>
        (filtroMarcaFecha === "TODAS" || f.marca === filtroMarcaFecha) &&
        (filtroCanalFecha === "TODAS" || f.canal === filtroCanalFecha) &&
        (filtroGrupoFecha === "TODAS" || f.grupo === filtroGrupoFecha) &&
        (filtroTipoFecha === "TODOS" || f.tipoPedido === filtroTipoFecha)
    );

    // Consolidamos por (fecha, marca): el canal se usa solo para filtrar,
    // no se muestra como columna ni se desglosa en el resultado.
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

    const fechasData = Array.from(consolidadoPorFechaMarca.values())
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

    // Subtotal sobre los datos ya filtrados (fecha + marca + canal). La eficiencia
    // se recalcula sobre los totales sumados, NO como promedio de los % de cada fila.
    const subtotalFecha = filasFiltradas.reduce(
      (acc, f) => ({
        uni: acc.uni + f.uni,
        pick: acc.pick + f.pick,
        sep: acc.sep + f.sep,
      }),
      { uni: 0, pick: 0, sep: 0 }
    );
    const subtotalFechaCalculado = {
      ...subtotalFecha,
      pendPick: subtotalFecha.uni - subtotalFecha.pick,
      pendSep: subtotalFecha.uni - subtotalFecha.sep,
      eficPick: subtotalFecha.uni > 0 ? (subtotalFecha.pick / subtotalFecha.uni) * 100 : 0,
      eficSep: subtotalFecha.uni > 0 ? (subtotalFecha.sep / subtotalFecha.uni) * 100 : 0,
    };

    return { fechasData, subtotalFechaCalculado };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaData, rangoFecha, fechaSeleccionada, semanaFecha, filtroMarcaFecha, filtroCanalFecha, filtroGrupoFecha, filtroTipoFecha, hoyISO, limiteFechaISO]);

  return (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-slate-800">Detalle por Fecha</h2>
                {fechaData && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(fechaData.updatedAt)}</span>
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
                        setRangoFecha(opcion.dias);
                        setFechaSeleccionada("");
                        setSemanaFecha(null);
                      }}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        !fechaSeleccionada && !semanaFecha && rangoFecha === opcion.dias
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
                  value={fechaSeleccionada}
                  onChange={(e) => {
                    setFechaSeleccionada(e.target.value);
                    setSemanaFecha(null);
                  }}
                  max={hoyISO}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    fechaSeleccionada ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                />

                <select
                  value={semanaFecha ? semanaFecha.desde : ""}
                  onChange={(e) => {
                    const semana = semanasConDatos.find((s) => s.desde === e.target.value);
                    if (semana) {
                      setSemanaFecha({ desde: semana.desde, hasta: semana.hasta });
                      setFechaSeleccionada("");
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    semanaFecha ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <option value="">Semana del año...</option>
                  {semanasConDatos.map((s) => (
                    <option key={s.desde} value={s.desde}>{s.label}</option>
                  ))}
                </select>

                <select
                  value={filtroMarcaFecha}
                  onChange={(e) => setFiltroMarcaFecha(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todas las marcas</option>
                  {marcasDisponiblesFecha.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <select
                  value={filtroCanalFecha}
                  onChange={(e) => setFiltroCanalFecha(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los canales</option>
                  {canalesDisponiblesFecha.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={filtroGrupoFecha}
                  onChange={(e) => setFiltroGrupoFecha(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los grupos</option>
                  {gruposDisponiblesFecha.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <select
                  value={filtroTipoFecha}
                  onChange={(e) => setFiltroTipoFecha(e.target.value as "TODOS" | "REMA" | "STD")}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODOS">Todos los pedidos</option>
                  <option value="REMA">REMA</option>
                  <option value="STD">STD</option>
                </select>

                <button
                  onClick={() => {
                    setRangoFecha(7);
                    setFechaSeleccionada("");
                    setSemanaFecha(null);
                    setFiltroMarcaFecha("TODAS");
                    setFiltroCanalFecha("TODAS");
                    setFiltroGrupoFecha("TODAS");
                    setFiltroTipoFecha("TODOS");
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

              {fechaError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el detalle por fecha: {fechaError}
                </div>
              )}
              {fechaLoading && !fechaData && (
                <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
                  <SkeletonTable rows={6} columns={5} />
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead>
                    {fechasData.length > 0 && (
                      <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                        <td className="py-3 px-4 text-left" colSpan={2}>
                          Subtotal
                          {filtroMarcaFecha !== "TODAS" ? ` — ${filtroMarcaFecha}` : " — Todas las marcas"}
                          {filtroCanalFecha !== "TODAS" ? ` — ${filtroCanalFecha}` : ""}
                          {filtroGrupoFecha !== "TODAS" ? ` — ${filtroGrupoFecha}` : ""}
                          {filtroTipoFecha !== "TODOS" ? ` — ${filtroTipoFecha}` : ""}
                        </td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaCalculado.uni)}</td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaCalculado.pick)}</td>
                        <td className="py-3 px-4 text-left">{fmtNum(subtotalFechaCalculado.sep)}</td>
                        <td className="py-3 px-4 text-left text-orange-600">{fmtNum(subtotalFechaCalculado.pendPick)}</td>
                        <td className="py-3 px-4 text-left text-red-600">{fmtNum(subtotalFechaCalculado.pendSep)}</td>
                        <td className="py-3 px-4 text-left">{fmtPct(subtotalFechaCalculado.eficPick)}</td>
                        <td className="py-3 px-4 text-left">{fmtPct(subtotalFechaCalculado.eficSep)}</td>
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
                    {fechasData.map((row, i) => (
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

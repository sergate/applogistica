"use client";

import { Fragment, useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha } from "@/components/dashboard/formatters";

interface ColeccionFila {
  coleccion: string;
  marca: string;
  curva: string;
  grupo: string;
  temporada: string;
  pedidas: number;
  distribuidas: number;
  aRepartir: number;
  stock: number;
}

interface ColeccionesData {
  filas: ColeccionFila[];
  articulosPorColeccion: Record<string, number>;
  updatedAt: string | null;
}

// Mismo orden fijo de curvas que Resumen.
const ORDEN_CURVAS = ["ADELANTO", "1RA ETAPA", "SEGUNDA ETAPA"];
const rankCurva = (curva: string) => {
  const idx = ORDEN_CURVAS.indexOf(curva);
  return idx === -1 ? 100 : idx;
};

const COLUMNAS = 8;

export default function CIColecciones() {
  const { activeTab, dataVersion } = useDashboard();

  const { data, error, isLoading } = useTabData<ColeccionesData>(
    activeTab,
    "CI-Colecciones",
    "/api/carga-inicial/colecciones",
    dataVersion
  );

  const [filtroColeccion, setFiltroColeccion] = useState("TODAS");
  const [filtroMarca, setFiltroMarca] = useState("TODAS");
  const [filtroTemporada, setFiltroTemporada] = useState("TODAS");
  const [filtroGrupo, setFiltroGrupo] = useState("TODAS");
  const [filaExpandida, setFilaExpandida] = useState<{ coleccion: string; marca: string; curva: string } | null>(null);

  const todas = data?.filas ?? [];
  const coleccionesDisponibles = Array.from(new Set(todas.map((f) => f.coleccion))).sort();
  const marcasDisponibles = Array.from(new Set(todas.map((f) => f.marca))).sort();
  const temporadasDisponibles = Array.from(new Set(todas.map((f) => f.temporada))).sort();
  const gruposDisponibles = Array.from(new Set(todas.map((f) => f.grupo))).sort();

  // Filtrado + consolidación por (colección, marca, curva) + subtotal.
  const { filasFiltradas, filasTabla, subtotal } = useMemo(() => {
    const filasFiltradas = (data?.filas ?? []).filter(
      (f) =>
        (filtroColeccion === "TODAS" || f.coleccion === filtroColeccion) &&
        (filtroMarca === "TODAS" || f.marca === filtroMarca) &&
        (filtroTemporada === "TODAS" || f.temporada === filtroTemporada) &&
        (filtroGrupo === "TODAS" || f.grupo === filtroGrupo)
    );

    const consolidado = new Map<
      string,
      { coleccion: string; marca: string; curva: string; pedidas: number; distribuidas: number; aRepartir: number; stock: number }
    >();
    for (const f of filasFiltradas) {
      const key = `${f.coleccion}__${f.marca}__${f.curva}`;
      if (!consolidado.has(key)) {
        consolidado.set(key, { coleccion: f.coleccion, marca: f.marca, curva: f.curva, pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 });
      }
      const acc = consolidado.get(key)!;
      acc.pedidas += f.pedidas;
      acc.distribuidas += f.distribuidas;
      acc.aRepartir += f.aRepartir;
      acc.stock += f.stock;
    }

    // Colecciones de mayor a menor por unidades pedidas; dentro de cada una,
    // marcas de mayor a menor y curvas en su orden fijo.
    const totalPorColeccion = new Map<string, number>();
    const totalPorColeccionMarca = new Map<string, number>();
    for (const acc of consolidado.values()) {
      totalPorColeccion.set(acc.coleccion, (totalPorColeccion.get(acc.coleccion) || 0) + acc.pedidas);
      const km = `${acc.coleccion}__${acc.marca}`;
      totalPorColeccionMarca.set(km, (totalPorColeccionMarca.get(km) || 0) + acc.pedidas);
    }

    const filasTabla = Array.from(consolidado.values())
      .map((acc) => ({ ...acc, completitud: acc.pedidas > 0 ? (acc.distribuidas / acc.pedidas) * 100 : 0 }))
      .sort((a, b) => {
        if (a.coleccion !== b.coleccion) {
          return (totalPorColeccion.get(b.coleccion) || 0) - (totalPorColeccion.get(a.coleccion) || 0) || a.coleccion.localeCompare(b.coleccion);
        }
        if (a.marca !== b.marca) {
          return (totalPorColeccionMarca.get(`${b.coleccion}__${b.marca}`) || 0) - (totalPorColeccionMarca.get(`${a.coleccion}__${a.marca}`) || 0);
        }
        return rankCurva(a.curva) - rankCurva(b.curva);
      });

    const sub = filasFiltradas.reduce(
      (acc, f) => ({
        pedidas: acc.pedidas + f.pedidas,
        distribuidas: acc.distribuidas + f.distribuidas,
        aRepartir: acc.aRepartir + f.aRepartir,
        stock: acc.stock + f.stock,
      }),
      { pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 }
    );
    const subtotal = { ...sub, completitud: sub.pedidas > 0 ? (sub.distribuidas / sub.pedidas) * 100 : 0 };

    return { filasFiltradas, filasTabla, subtotal };
  }, [data, filtroColeccion, filtroMarca, filtroTemporada, filtroGrupo]);

  // Desglose por grupo de la fila (colección + marca + curva) expandida.
  const desgloseGrupo = useMemo(() => {
    if (!filaExpandida) return [];
    const porGrupo = new Map<string, { grupo: string; pedidas: number; distribuidas: number; aRepartir: number; stock: number }>();
    for (const f of filasFiltradas) {
      if (f.coleccion !== filaExpandida.coleccion || f.marca !== filaExpandida.marca || f.curva !== filaExpandida.curva) continue;
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
  }, [filasFiltradas, filaExpandida]);

  const handleFilaClick = (coleccion: string, marca: string, curva: string) => {
    setFilaExpandida(
      filaExpandida?.coleccion === coleccion && filaExpandida?.marca === marca && filaExpandida?.curva === curva
        ? null
        : { coleccion, marca, curva }
    );
  };

  const hayFiltros = filtroColeccion !== "TODAS" || filtroMarca !== "TODAS" || filtroTemporada !== "TODAS" || filtroGrupo !== "TODAS";
  const claseSelect =
    "px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-800">Detalle por Colección / Marca / Curva</h2>
          {data && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(data.updatedAt)}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Pedidos de Carga Inicial agrupados por la colección (observación) de sus artículos master. Hacé click en una curva
          para ver el desglose por grupo.
        </p>

        {/* FILTROS */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <select value={filtroColeccion} onChange={(e) => setFiltroColeccion(e.target.value)} className={claseSelect}>
            <option value="TODAS">Todas las colecciones</option>
            {coleccionesDisponibles.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)} className={claseSelect}>
            <option value="TODAS">Todas las marcas</option>
            {marcasDisponibles.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select value={filtroTemporada} onChange={(e) => setFiltroTemporada(e.target.value)} className={claseSelect}>
            <option value="TODAS">Todas las temporadas</option>
            {temporadasDisponibles.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className={claseSelect}>
            <option value="TODAS">Todos los grupos</option>
            {gruposDisponibles.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <button
            onClick={() => {
              setFiltroColeccion("TODAS");
              setFiltroMarca("TODAS");
              setFiltroTemporada("TODAS");
              setFiltroGrupo("TODAS");
            }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Limpiar filtros
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            Error al cargar las colecciones: {error}
          </div>
        )}
        {isLoading && !data && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
            <SkeletonTable rows={6} columns={5} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              {filasTabla.length > 0 && (
                <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                  <td className="py-3 px-4 text-left" colSpan={3}>
                    Subtotal
                    {filtroColeccion !== "TODAS" ? ` — ${filtroColeccion}` : " — Todas las colecciones"}
                    {filtroMarca !== "TODAS" ? ` — ${filtroMarca}` : ""}
                    {filtroTemporada !== "TODAS" ? ` — ${filtroTemporada}` : ""}
                    {filtroGrupo !== "TODAS" ? ` — ${filtroGrupo}` : ""}
                  </td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotal.pedidas)}</td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotal.distribuidas)}</td>
                  <td className="py-3 px-4 text-left font-semibold text-orange-500">{fmtNum(subtotal.aRepartir)}</td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotal.stock)}</td>
                  <td className="py-3 px-4 text-left">{fmtPct(subtotal.completitud)}</td>
                </tr>
              )}
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Colección</th>
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
              {filasTabla.map((row, i) => {
                const estaExpandida =
                  filaExpandida?.coleccion === row.coleccion &&
                  filaExpandida?.marca === row.marca &&
                  filaExpandida?.curva === row.curva;
                const esPrimeraDeColeccion = i === 0 || filasTabla[i - 1].coleccion !== row.coleccion;
                return (
                  <Fragment key={`${row.coleccion}-${row.marca}-${row.curva}`}>
                    <tr
                      onClick={() => handleFilaClick(row.coleccion, row.marca, row.curva)}
                      className={`cursor-pointer transition-colors ${estaExpandida ? "bg-slate-100" : "hover:bg-slate-50"} ${
                        esPrimeraDeColeccion && i > 0 ? "border-t-2 border-slate-200" : ""
                      }`}
                    >
                      <td className="py-3 px-4 text-left">
                        {esPrimeraDeColeccion && (
                          <>
                            <div className="font-bold text-slate-900">{row.coleccion}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {data?.articulosPorColeccion[row.coleccion] ?? 0} artículos master
                            </div>
                          </>
                        )}
                      </td>
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
                        <td colSpan={COLUMNAS} className="bg-slate-50 px-4 py-4">
                          <p className="text-xs font-semibold text-slate-500 mb-2">
                            Desglose por grupo — {row.coleccion} / {row.marca} / {row.curva}
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
                              {desgloseGrupo.map((g) => (
                                <tr key={g.grupo}>
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {filasTabla.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">
              {hayFiltros
                ? "No hay datos que coincidan con los filtros aplicados."
                : "Todavía no hay datos: registrá artículos master con su observación en Carga Datos y importá la Carga Inicial."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha, semanasConDatosDe } from "@/components/dashboard/formatters";

interface PedidoResumen {
  pedido: string;
  grupo: string;
  codigoTienda: string;
  cliente: string;
  // Grupos de Despacho -> Grupos de Clientes a los que pertenece el código
  // de tienda de este pedido (puede estar en varios a la vez, ej.
  // "Franquicias 1" y "Miércoles Propios") -- no confundir con "grupo" de
  // arriba, que es el grupo de línea del pedido en el WMS.
  gruposClientes: string[];
  nombrePedido: string;
  tipoPedido: "REMA" | "STD";
  marca: string;
  canal: string;
  fecha: string;
  uni: number;
  pick: number;
  sep: number;
  pendPick: number;
  pendSep: number;
  eficPick: number;
  eficSep: number;
}

export default function PorPedidos() {
  const { activeTab, dataVersion } = useDashboard();

  const {
    data: pedidosData,
    error: pedidosError,
    isLoading: pedidosLoading,
  } = useTabData<{ filas: PedidoResumen[]; updatedAt: string | null }>(
    activeTab,
    "Por pedidos",
    "/api/resumen/pedidos",
    dataVersion
  );

  // Semanas para el selector de "Por pedidos" -- calculadas sobre los datos
  // de ESTA pestaña (no sobre "Por fecha", que solo se pide a la API cuando
  // esa otra pestaña está activa y por eso quedaba vacío acá).
  const semanasConDatosPedidos = semanasConDatosDe((pedidosData?.filas ?? []).map((f) => f.fecha));

  const [busquedaPedidos, setBusquedaPedidos] = useState("");
  const [filtroMarcaPedidos, setFiltroMarcaPedidos] = useState("TODAS");
  const [filtroCanalPedidos, setFiltroCanalPedidos] = useState("TODAS");
  const [filtroGrupoPedidos, setFiltroGrupoPedidos] = useState("TODAS");
  const [filtroTipoPedidos, setFiltroTipoPedidos] = useState<"TODOS" | "REMA" | "STD">("TODOS");
  // Selección múltiple: array vacío = sin filtrar (todos los grupos de clientes).
  const [filtroGruposClientesPedidos, setFiltroGruposClientesPedidos] = useState<string[]>([]);
  const [gruposClientesDropdownAbiertoPedidos, setGruposClientesDropdownAbiertoPedidos] = useState(false);
  const gruposClientesDropdownRefPedidos = useRef<HTMLDivElement>(null);
  const [rangoFechaPedidos, setRangoFechaPedidos] = useState<7 | 14 | 30>(7);
  const [semanaPedidos, setSemanaPedidos] = useState<{ desde: string; hasta: string } | null>(null);

  const toggleFiltroGrupoClientesPedidos = (grupo: string) => {
    setFiltroGruposClientesPedidos((prev) => (prev.includes(grupo) ? prev.filter((g) => g !== grupo) : [...prev, grupo]));
  };

  useEffect(() => {
    if (!gruposClientesDropdownAbiertoPedidos) return;
    const onClickFuera = (e: MouseEvent) => {
      if (gruposClientesDropdownRefPedidos.current && !gruposClientesDropdownRefPedidos.current.contains(e.target as Node)) {
        setGruposClientesDropdownAbiertoPedidos(false);
      }
    };
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [gruposClientesDropdownAbiertoPedidos]);

  const [pedidoExpandido, setPedidoExpandido] = useState<string | null>(null);
  interface GrupoDetalle {
    grupo: string;
    nombrePedido: string;
    uni: number;
    pick: number;
    sep: number;
    pendPick: number;
    pendSep: number;
    eficPick: number;
    eficSep: number;
  }
  const [gruposDelPedido, setGruposDelPedido] = useState<GrupoDetalle[] | null>(null);
  const [gruposLoading, setGruposLoading] = useState(false);
  const [gruposError, setGruposError] = useState<string | null>(null);


  const handleTiendaClick = async (pedido: string) => {
    if (pedidoExpandido === pedido) {
      setPedidoExpandido(null);
      setGruposDelPedido(null);
      setGruposError(null);
      return;
    }
    setPedidoExpandido(pedido);
    setGruposDelPedido(null);
    setGruposError(null);
    setGruposLoading(true);
    try {
      const res = await fetch(`/api/resumen/pedidos/grupos?pedido=${encodeURIComponent(pedido)}`, { cache: "no-store" });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo cargar el detalle por grupo.");
      }
      setGruposDelPedido(data.grupos);
    } catch (err) {
      setGruposError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGruposLoading(false);
    }
  };

  const hoyPedidosISO = new Date().toISOString().slice(0, 10);
  const limitePedidosISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangoFechaPedidos - 1));
    return d.toISOString().slice(0, 10);
  })();

  const marcasDisponiblesPedidos = Array.from(new Set((pedidosData?.filas ?? []).map((f) => f.marca))).sort();
  const canalesDisponiblesPedidos = Array.from(new Set((pedidosData?.filas ?? []).map((f) => f.canal))).sort();
  const gruposDisponiblesPedidos = Array.from(new Set((pedidosData?.filas ?? []).map((f) => f.grupo))).sort();
  // Solo los grupos de clientes que realmente aparecen en los pedidos
  // traídos (no la lista completa del maestro despacho_grupos_clientes).
  const gruposClientesDisponiblesPedidos = Array.from(
    new Set((pedidosData?.filas ?? []).flatMap((f) => f.gruposClientes))
  ).sort();

  const busquedaNormalizada = busquedaPedidos.trim().toLowerCase();

  // Filtrado + consolidación por pedido + subtotal, todo junto en un
  // useMemo para no recalcularlo en cada render del componente.
  const { filasFiltradasPedidos, subtotalPedidosCalculado } = useMemo(() => {
    // Filtrado a nivel (pedido, grupo) -- todavía sin consolidar.
    const filasCrudasPedidos = (pedidosData?.filas ?? []).filter((f) => {
      const enRango = semanaPedidos
        ? f.fecha !== "SIN FECHA" && f.fecha >= semanaPedidos.desde && f.fecha <= semanaPedidos.hasta
        : f.fecha !== "SIN FECHA" && f.fecha >= limitePedidosISO && f.fecha <= hoyPedidosISO;
      if (!enRango) return false;
      if (filtroMarcaPedidos !== "TODAS" && f.marca !== filtroMarcaPedidos) return false;
      if (filtroCanalPedidos !== "TODAS" && f.canal !== filtroCanalPedidos) return false;
      if (filtroGrupoPedidos !== "TODAS" && f.grupo !== filtroGrupoPedidos) return false;
      if (filtroTipoPedidos !== "TODOS" && f.tipoPedido !== filtroTipoPedidos) return false;
      if (filtroGruposClientesPedidos.length > 0 && !f.gruposClientes.some((g) => filtroGruposClientesPedidos.includes(g))) {
        return false;
      }
      if (busquedaNormalizada) {
        const matchCliente = f.cliente.toLowerCase().includes(busquedaNormalizada);
        const matchCodigo = f.codigoTienda.toLowerCase().includes(busquedaNormalizada);
        if (!matchCliente && !matchCodigo) return false;
      }
      return true;
    });

    // Consolidamos por pedido: el filtro de grupo ya se aplicó arriba, así que
    // acá solo sumamos lo que haya quedado (si es "Todos los grupos", suma
    // todas las líneas del pedido; si es un grupo puntual, solo esa porción).
    const consolidadoPorPedido = new Map<string, PedidoResumen>();
    for (const f of filasCrudasPedidos) {
      const existente = consolidadoPorPedido.get(f.pedido);
      if (!existente) {
        consolidadoPorPedido.set(f.pedido, { ...f });
      } else {
        existente.uni += f.uni;
        existente.pick += f.pick;
        existente.sep += f.sep;
      }
    }
    const filasFiltradasPedidos = Array.from(consolidadoPorPedido.values()).map((f) => ({
      ...f,
      pendPick: f.uni - f.pick,
      pendSep: f.uni - f.sep,
      eficPick: f.uni > 0 ? (f.pick / f.uni) * 100 : 0,
      eficSep: f.uni > 0 ? (f.sep / f.uni) * 100 : 0,
    }));

    const subtotalPedidos = filasFiltradasPedidos.reduce(
      (acc, f) => ({ uni: acc.uni + f.uni, pick: acc.pick + f.pick, sep: acc.sep + f.sep }),
      { uni: 0, pick: 0, sep: 0 }
    );
    const subtotalPedidosCalculado = {
      ...subtotalPedidos,
      pendPick: subtotalPedidos.uni - subtotalPedidos.pick,
      pendSep: subtotalPedidos.uni - subtotalPedidos.sep,
      eficPick: subtotalPedidos.uni > 0 ? (subtotalPedidos.pick / subtotalPedidos.uni) * 100 : 0,
      eficSep: subtotalPedidos.uni > 0 ? (subtotalPedidos.sep / subtotalPedidos.uni) * 100 : 0,
    };

    return { filasFiltradasPedidos, subtotalPedidosCalculado };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pedidosData,
    semanaPedidos,
    limitePedidosISO,
    hoyPedidosISO,
    filtroMarcaPedidos,
    filtroCanalPedidos,
    filtroGrupoPedidos,
    filtroTipoPedidos,
    filtroGruposClientesPedidos,
    busquedaNormalizada,
  ]);

  const exportarPedidosAExcel = async () => {
    const XLSX = await import("xlsx");
    const filasExport = filasFiltradasPedidos.map((f) => ({
      "Código Tienda": f.codigoTienda,
      Cliente: f.cliente,
      "Grupo de Clientes": f.gruposClientes.join(", "),
      "N° Pedido": f.pedido,
      Marca: f.marca,
      Canal: f.canal,
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
    XLSX.utils.book_append_sheet(libro, hoja, "Por Pedidos");
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(libro, `pedidos_${fechaArchivo}.xlsx`);
  };

  return (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-xl font-bold text-slate-800">Detalle por Pedidos</h2>
                {pedidosData && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(pedidosData.updatedAt)}</span>
                  </div>
                )}
              </div>

              {/* FILTROS */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input
                  type="text"
                  value={busquedaPedidos}
                  onChange={(e) => setBusquedaPedidos(e.target.value)}
                  placeholder="Buscar por cliente o número de tienda..."
                  className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 min-w-[260px]"
                />

                <select
                  value={filtroMarcaPedidos}
                  onChange={(e) => setFiltroMarcaPedidos(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todas las marcas</option>
                  {marcasDisponiblesPedidos.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <select
                  value={filtroCanalPedidos}
                  onChange={(e) => setFiltroCanalPedidos(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los canales</option>
                  {canalesDisponiblesPedidos.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={filtroGrupoPedidos}
                  onChange={(e) => setFiltroGrupoPedidos(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODAS">Todos los grupos</option>
                  {gruposDisponiblesPedidos.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <div className="relative" ref={gruposClientesDropdownRefPedidos}>
                  <button
                    type="button"
                    onClick={() => setGruposClientesDropdownAbiertoPedidos((v) => !v)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {filtroGruposClientesPedidos.length === 0
                      ? "Todos los grupos de clientes"
                      : `${filtroGruposClientesPedidos.length} grupo${filtroGruposClientesPedidos.length === 1 ? "" : "s"} de clientes seleccionado${filtroGruposClientesPedidos.length === 1 ? "" : "s"}`}
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {gruposClientesDropdownAbiertoPedidos && (
                    <div className="absolute z-20 mt-1 w-56 max-h-72 overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-lg p-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFiltroGruposClientesPedidos(
                            filtroGruposClientesPedidos.length === gruposClientesDisponiblesPedidos.length
                              ? []
                              : gruposClientesDisponiblesPedidos
                          )
                        }
                        className="w-full text-left px-2 py-1.5 rounded text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        {filtroGruposClientesPedidos.length === gruposClientesDisponiblesPedidos.length
                          ? "Deseleccionar todos"
                          : "Seleccionar todos"}
                      </button>
                      <div className="border-t border-slate-100 my-1" />
                      {gruposClientesDisponiblesPedidos.map((g) => (
                        <label key={g} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={filtroGruposClientesPedidos.includes(g)}
                            onChange={() => toggleFiltroGrupoClientesPedidos(g)}
                            className="w-3.5 h-3.5"
                          />
                          {g}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <select
                  value={filtroTipoPedidos}
                  onChange={(e) => setFiltroTipoPedidos(e.target.value as "TODOS" | "REMA" | "STD")}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="TODOS">Todos los pedidos</option>
                  <option value="REMA">REMA</option>
                  <option value="STD">STD</option>
                </select>

                <button
                  onClick={exportarPedidosAExcel}
                  disabled={filasFiltradasPedidos.length === 0}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ml-auto ${
                    filasFiltradasPedidos.length === 0
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

              {/* BOTONES DE RANGO DE FECHA */}
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {([
                  { label: "Última semana", dias: 7 as const },
                  { label: "Últimos 14 días", dias: 14 as const },
                  { label: "Último mes", dias: 30 as const },
                ]).map((opcion) => (
                  <button
                    key={opcion.dias}
                    onClick={() => {
                      setRangoFechaPedidos(opcion.dias);
                      setSemanaPedidos(null);
                    }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      !semanaPedidos && rangoFechaPedidos === opcion.dias
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {opcion.label}
                  </button>
                ))}

                <select
                  value={semanaPedidos ? semanaPedidos.desde : ""}
                  onChange={(e) => {
                    const semana = semanasConDatosPedidos.find((s) => s.desde === e.target.value);
                    if (semana) setSemanaPedidos({ desde: semana.desde, hasta: semana.hasta });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    semanaPedidos ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <option value="">Semana del año...</option>
                  {semanasConDatosPedidos.map((s) => (
                    <option key={s.desde} value={s.desde}>{s.label}</option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setRangoFechaPedidos(7);
                    setSemanaPedidos(null);
                    setFiltroMarcaPedidos("TODAS");
                    setFiltroCanalPedidos("TODAS");
                    setFiltroGrupoPedidos("TODAS");
                    setFiltroGruposClientesPedidos([]);
                    setBusquedaPedidos("");
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>

              {pedidosError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Error al cargar el detalle por pedidos: {pedidosError}
                </div>
              )}
              {pedidosLoading && !pedidosData && (
                <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
                  <SkeletonTable rows={6} columns={6} />
                </div>
              )}

              {/* TARJETAS DE SUBTOTAL */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                {[
                  { label: "Unidades", value: fmtNum(subtotalPedidosCalculado.uni), color: "text-slate-800" },
                  { label: "Pickeado", value: fmtNum(subtotalPedidosCalculado.pick), color: "text-slate-800" },
                  { label: "Separado", value: fmtNum(subtotalPedidosCalculado.sep), color: "text-slate-800" },
                  { label: "Pend. Pick", value: fmtNum(subtotalPedidosCalculado.pendPick), color: "text-orange-600" },
                  { label: "Pend. Sep.", value: fmtNum(subtotalPedidosCalculado.pendSep), color: "text-red-600" },
                ].map((card) => (
                  <div key={card.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                    <p className="text-xs font-medium text-slate-500 mb-2">{card.label}</p>
                    <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              {/* TABLA DE DETALLE */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="py-4 px-4 text-left">Código Tienda</th>
                      <th className="py-4 px-4 text-left">Cliente</th>
                      <th className="py-4 px-4 text-left">Grupo de Clientes</th>
                      <th className="py-4 px-4 text-left">N° Pedido</th>
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
                    {filasFiltradasPedidos.map((row, i) => (
                      <>
                        <tr
                          key={`${row.pedido}-${i}`}
                          onClick={() => handleTiendaClick(row.pedido)}
                          className={`cursor-pointer transition-colors ${
                            pedidoExpandido === row.pedido ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="py-4 px-4 text-left font-semibold text-slate-800">{row.codigoTienda}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{row.cliente}</td>
                          <td className="py-4 px-4 text-left text-slate-600">
                            {row.gruposClientes.length > 0 ? row.gruposClientes.join(", ") : "—"}
                          </td>
                          <td className="py-4 px-4 text-left text-slate-600">{row.pedido}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.uni)}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.pick)}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.sep)}</td>
                          <td className="py-4 px-4 text-left font-semibold text-orange-500">{fmtNum(row.pendPick)}</td>
                          <td className="py-4 px-4 text-left font-semibold text-red-500">{fmtNum(row.pendSep)}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtPct(row.eficPick)}</td>
                          <td className="py-4 px-4 text-left text-slate-600">{fmtPct(row.eficSep)}</td>
                        </tr>

                        {pedidoExpandido === row.pedido && (
                          <tr>
                            <td colSpan={11} className="bg-slate-50 px-4 py-4">
                              <p className="text-xs font-semibold text-slate-500 mb-2">
                                Detalle por grupo — pedido {row.pedido}
                              </p>
                              {gruposLoading && (
                                <p className="text-sm text-slate-500">Cargando detalle...</p>
                              )}
                              {gruposError && (
                                <p className="text-sm text-red-600">Error: {gruposError}</p>
                              )}
                              {!gruposLoading && !gruposError && gruposDelPedido && (
                                <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                                  <thead className="text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                      <th className="py-2 px-3 text-left">Grupo</th>
                                      <th className="py-2 px-3 text-left">Unidades</th>
                                      <th className="py-2 px-3 text-left">Pickeadas</th>
                                      <th className="py-2 px-3 text-left">Separadas</th>
                                      <th className="py-2 px-3 text-left">Pend. Pick</th>
                                      <th className="py-2 px-3 text-left">Pend. Sep</th>
                                      <th className="py-2 px-3 text-left">Efic. Pick %</th>
                                      <th className="py-2 px-3 text-left">Efic. Sep %</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {gruposDelPedido.map((g, gi) => (
                                      <tr key={gi}>
                                        <td className="py-2 px-3 text-left font-medium text-slate-700">{g.grupo}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.uni)}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.pick)}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtNum(g.sep)}</td>
                                        <td className="py-2 px-3 text-left font-semibold text-orange-500">{fmtNum(g.pendPick)}</td>
                                        <td className="py-2 px-3 text-left font-semibold text-red-500">{fmtNum(g.pendSep)}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtPct(g.eficPick)}</td>
                                        <td className="py-2 px-3 text-left text-slate-600">{fmtPct(g.eficSep)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
                {filasFiltradasPedidos.length === 0 && !pedidosLoading && (
                  <p className="text-sm text-slate-400 text-center py-8">No hay pedidos que coincidan con los filtros aplicados.</p>
                )}
              </div>
            </div>
  );
}

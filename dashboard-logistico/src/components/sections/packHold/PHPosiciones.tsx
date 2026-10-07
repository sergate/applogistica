"use client";

import { Fragment, useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import { fmtNum, fmtFecha } from "@/components/dashboard/formatters";

interface GuiaFila {
  despachoCabId: number;
  guia: string;
  clienteCodigo: string;
  cliente: string;
  contenedores: number;
  fechaCreacion: string | null;
  fecha: string | null;
  antiguedad: number | null;
  posiciones: string[];
  estado: "ubicada" | "sin_ubicar";
  plan: string | null;
}

interface PosicionFila {
  posicion: string;
  guia: string;
  despachoCabId: number;
  cliente: string;
  registradaEn: string | null;
  registradaPor: string | null;
  plan: string | null;
}

interface PosicionesData {
  guias: GuiaFila[];
  posiciones: PosicionFila[];
  ultimaImportacion: string | null;
}

interface DetalleGuia {
  contenedores: { contenedor: string; unidades: number | null; remito: string | null }[];
  packing: { contenedor: string; sku: string; cantidad: number | null }[];
  posiciones: { posicion: string; contenedorEscaneado: string | null; registradaEn: string | null; registradaPor: string | null }[];
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" sin pasar por Date (evita corrimientos por huso horario).
const fmtDia = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

const claseSelect =
  "px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer";

function Pastilla({ guia }: { guia: GuiaFila }) {
  if (guia.estado === "sin_ubicar") {
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Sin ubicar</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Ubicada</span>;
}

export default function PHPosiciones() {
  const { activeTab, dataVersion, setDataVersion, tienePermiso } = useDashboard();

  const { data, error, isLoading } = useTabData<PosicionesData>(
    activeTab,
    "PH-Posiciones",
    "/api/pack-hold/guias",
    dataVersion
  );

  const [vista, setVista] = useState<"guia" | "posicion">("guia");
  const [filtroCliente, setFiltroCliente] = useState("TODOS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");

  const [expandida, setExpandida] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DetalleGuia | null>(null);
  const [detalleCargando, setDetalleCargando] = useState(false);
  const [detalleError, setDetalleError] = useState<string | null>(null);
  const [verPacking, setVerPacking] = useState(false);

  const [posicionPorLiberar, setPosicionPorLiberar] = useState<string | null>(null);
  const [formPosicion, setFormPosicion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const puedeEditar = tienePermiso("PH-Liberar");
  const puedeImportar = tienePermiso("PH-Importar");

  const guias = useMemo(() => data?.guias ?? [], [data]);
  const posiciones = useMemo(() => data?.posiciones ?? [], [data]);
  const clientes = Array.from(new Set(guias.map((g) => g.cliente))).sort();

  const kpis = useMemo(
    () => ({
      pendientes: guias.length,
      ubicadas: guias.filter((g) => g.estado === "ubicada").length,
      sinUbicar: guias.filter((g) => g.estado === "sin_ubicar").length,
      ocupadas: posiciones.length,
      enPlan: guias.filter((g) => g.plan).length,
      // Bultos = contenedores de las guías. Como no se sabe cuántos contenedores
      // hay en cada posición, una guía con al menos una posición cuenta con todos
      // sus bultos como ubicados (no hay ubicaciones parciales).
      bultosUbicados: guias.filter((g) => g.estado === "ubicada").reduce((acc, g) => acc + g.contenedores, 0),
      bultosTotales: guias.reduce((acc, g) => acc + g.contenedores, 0),
    }),
    [guias, posiciones]
  );

  const texto = busqueda.trim().toLowerCase();

  const guiasFiltradas = useMemo(
    () =>
      guias
        .filter(
          (g) =>
            (filtroCliente === "TODOS" || g.cliente === filtroCliente) &&
            (filtroEstado === "TODOS" ||
              (filtroEstado === "en_plan" ? !!g.plan : g.estado === filtroEstado)) &&
            (!texto ||
              g.guia.toLowerCase().includes(texto) ||
              g.cliente.toLowerCase().includes(texto) ||
              (g.plan ?? "").toLowerCase().includes(texto) ||
              g.posiciones.some((p) => p.toLowerCase().includes(texto)))
        )
        .sort((a, b) => a.cliente.localeCompare(b.cliente) || a.guia.localeCompare(b.guia)),
    [guias, filtroCliente, filtroEstado, texto]
  );

  const posicionesFiltradas = useMemo(
    () =>
      posiciones.filter(
        (p) =>
          (filtroCliente === "TODOS" || p.cliente === filtroCliente) &&
          (!texto ||
            p.posicion.toLowerCase().includes(texto) ||
            p.guia.toLowerCase().includes(texto) ||
            p.cliente.toLowerCase().includes(texto) ||
            (p.plan ?? "").toLowerCase().includes(texto))
      ),
    [posiciones, filtroCliente, texto]
  );

  const cargarDetalle = async (despachoCabId: number) => {
    setDetalleCargando(true);
    setDetalleError(null);
    try {
      const res = await fetch(`/api/pack-hold/guias/${despachoCabId}/detalle`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo cargar el detalle.");
      setDetalle({ contenedores: json.contenedores, packing: json.packing, posiciones: json.posiciones });
    } catch (err) {
      setDetalleError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDetalleCargando(false);
    }
  };

  const abrirGuia = (g: GuiaFila) => {
    if (expandida === g.despachoCabId) {
      setExpandida(null);
      return;
    }
    setExpandida(g.despachoCabId);
    setDetalle(null);
    setVerPacking(false);
    setMensaje(null);
    setPosicionPorLiberar(null);
    setFormPosicion("");
    cargarDetalle(g.despachoCabId);
  };

  const liberar = async (posicion: string, despachoCabId: number) => {
    setMensaje(null);
    try {
      const res = await fetch(`/api/pack-hold/posiciones/${encodeURIComponent(posicion)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo liberar la posición.");
      setPosicionPorLiberar(null);
      setMensaje({ ok: true, texto: `Se liberó ${posicion}.` });
      await cargarDetalle(despachoCabId);
      setDataVersion((v) => v + 1);
    } catch (err) {
      setMensaje({ ok: false, texto: err instanceof Error ? err.message : "Error inesperado." });
    }
  };

  const registrar = async (despachoCabId: number) => {
    const contenedor = detalle?.contenedores[0]?.contenedor;
    if (!contenedor || !formPosicion.trim()) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/pack-hold/posiciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenedor, posicion: formPosicion }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo registrar la posición.");
      setMensaje({
        ok: true,
        texto:
          json.estado === "ya_registrada"
            ? `${json.posicion} ya estaba registrada para esta guía.`
            : `Guía registrada en ${json.posicion}.`,
      });
      setFormPosicion("");
      await cargarDetalle(despachoCabId);
      setDataVersion((v) => v + 1);
    } catch (err) {
      setMensaje({ ok: false, texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setGuardando(false);
    }
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const hojaGuias = guiasFiltradas.map((g) => ({
      Guía: g.guia,
      Fecha: fmtDia(g.fecha),
      "Antigüedad (días hábiles)": g.antiguedad ?? "",
      Cliente: g.cliente,
      Contenedores: g.contenedores,
      Posiciones: g.posiciones.join(", "),
      Estado: g.estado === "ubicada" ? "Ubicada" : "Sin ubicar",
      Plan: g.plan ?? "",
    }));
    const hojaPosiciones = posicionesFiltradas.map((p) => ({
      Posición: p.posicion,
      Guía: p.guia,
      Cliente: p.cliente,
      Plan: p.plan ?? "",
      "Registrada en": p.registradaEn ? fmtFecha(p.registradaEn) : "",
      "Registrada por": p.registradaPor ?? "",
    }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaGuias), "Guías");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaPosiciones), "Posiciones");
    XLSX.writeFile(libro, `pack_and_hold_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const hayFiltros = filtroCliente !== "TODOS" || filtroEstado !== "TODOS" || texto !== "";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Guías y posiciones ocupadas</h2>
            {data && (
              <p className="text-xs text-slate-500 mt-0.5">
                Última importación:{" "}
                <span className="font-medium text-slate-700">{fmtFecha(data.ultimaImportacion)}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {puedeImportar && (
              <ActualizarAgenteBoton
                seccion="pack_hold_importar"
                label="Importar guías pendientes (WMS)"
                onExito={() => setDataVersion((v) => v + 1)}
              />
            )}
            <button
              onClick={exportarExcel}
              disabled={guiasFiltradas.length === 0}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                guiasFiltradas.length === 0
                  ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              Exportar a Excel
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          Guías de franquicias pendientes de despacho (estado DP_INICIADO en el WMS) y la posición del rack donde está
          cada una. Una guía queda ubicada apenas tiene una posición registrada. Pack and Hold solo registra: el
          despacho se sigue haciendo en el WMS.
        </p>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[
            { n: fmtNum(kpis.pendientes), t: "Guías pendientes" },
            { n: fmtNum(kpis.ubicadas), t: "Guías ubicadas" },
            { n: fmtNum(kpis.sinUbicar), t: "Guías sin ubicar" },
            {
              n: `${fmtNum(kpis.bultosUbicados)} / ${fmtNum(kpis.bultosTotales)}`,
              t: "Bultos ubicados / totales",
            },
            { n: fmtNum(kpis.ocupadas), t: "Posiciones ocupadas" },
            { n: fmtNum(kpis.enPlan), t: "Guías en un plan" },
          ].map((k) => (
            <div key={k.t} className="border border-slate-200 rounded-lg px-4 py-3">
              <div className="text-2xl font-bold text-slate-900 whitespace-nowrap">{k.n}</div>
              <div className="text-xs text-slate-500">{k.t}</div>
            </div>
          ))}
        </div>

        {/* FILTROS */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(["guia", "posicion"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  vista === v ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v === "guia" ? "Por guía" : "Por posición"}
              </button>
            ))}
          </div>
          <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className={claseSelect}>
            <option value="TODOS">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {vista === "guia" && (
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={claseSelect}>
              <option value="TODOS">Todos los estados</option>
              <option value="ubicada">Ubicadas</option>
              <option value="sin_ubicar">Sin ubicar</option>
              <option value="en_plan">En un plan</option>
            </select>
          )}
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar guía, cliente o posición..."
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          {hayFiltros && (
            <button
              onClick={() => {
                setFiltroCliente("TODOS");
                setFiltroEstado("TODOS");
                setBusqueda("");
              }}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            Error al cargar: {error}
          </div>
        )}
        {isLoading && !data && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
            <SkeletonTable rows={6} columns={6} />
          </div>
        )}

        <div className="overflow-x-auto">
          {vista === "guia" ? (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="text-slate-500 font-medium border-b border-slate-200">
                  <th className="py-3 px-4 text-left">Guía</th>
                  <th className="py-3 px-4 text-left">Fecha</th>
                  <th className="py-3 px-4 text-left" title="Días hábiles desde la creación de la guía">Antigüedad (días háb.)</th>
                  <th className="py-3 px-4 text-left">Cliente</th>
                  <th className="py-3 px-4 text-left">Contenedores (WMS)</th>
                  <th className="py-3 px-4 text-left">Posiciones</th>
                  <th className="py-3 px-4 text-left">Estado</th>
                  <th className="py-3 px-4 text-left">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guiasFiltradas.map((g) => {
                  const abierta = expandida === g.despachoCabId;
                  return (
                    <Fragment key={g.despachoCabId}>
                      <tr
                        onClick={() => abrirGuia(g)}
                        className={`cursor-pointer transition-colors ${abierta ? "bg-slate-100" : "hover:bg-slate-50"}`}
                      >
                        <td className="py-3 px-4 text-left font-bold text-slate-900 font-mono">{g.guia}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fmtDia(g.fecha) || "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-700 font-semibold">{g.antiguedad ?? "—"}</td>
                        <td className="py-3 px-4 text-left text-slate-700">{g.cliente}</td>
                        <td className="py-3 px-4 text-left text-slate-600">{fmtNum(g.contenedores)}</td>
                        <td className="py-3 px-4 text-left">
                          {g.posiciones.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 whitespace-normal">
                              {g.posiciones.map((p) => (
                                <span key={p} className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700">
                                  {p}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-left"><Pastilla guia={g} /></td>
                        <td className="py-3 px-4 text-left">
                          {g.plan ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{g.plan}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>

                      {abierta && (
                        <tr>
                          <td colSpan={8} className="bg-slate-50 px-4 py-4">
                            <p className="text-xs font-semibold text-slate-500 mb-3">
                              Detalle de la guía {g.guia} — {g.cliente}
                            </p>
                            {detalleCargando && !detalle && <p className="text-sm text-slate-400">Cargando...</p>}
                            {detalleError && <p className="text-sm text-red-600">Error: {detalleError}</p>}
                            {mensaje && (
                              <div
                                className={`mb-3 p-3 rounded-lg text-sm border ${
                                  mensaje.ok
                                    ? "bg-green-50 border-green-200 text-green-700"
                                    : "bg-red-50 border-red-200 text-red-700"
                                }`}
                              >
                                {mensaje.texto}
                              </div>
                            )}
                            {detalle && (
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="bg-white rounded-lg border border-slate-200 p-3">
                                  <p className="text-sm font-bold text-slate-700 mb-2">Posiciones registradas</p>
                                  {detalle.posiciones.length === 0 ? (
                                    <p className="text-sm text-slate-400 mb-2">Todavía no tiene posiciones.</p>
                                  ) : (
                                    <table className="w-full text-sm mb-2">
                                      <tbody className="divide-y divide-slate-100">
                                        {detalle.posiciones.map((p) => (
                                          <tr key={p.posicion}>
                                            <td className="py-2 pr-3 font-mono font-semibold text-slate-800">{p.posicion}</td>
                                            <td className="py-2 pr-3 text-xs text-slate-500">
                                              {p.registradaEn ? fmtFecha(p.registradaEn) : ""}
                                              {p.registradaPor ? ` · ${p.registradaPor}` : ""}
                                              {p.contenedorEscaneado && (
                                                <div className="font-mono">escaneó {p.contenedorEscaneado}</div>
                                              )}
                                            </td>
                                            <td className="py-2 text-right">
                                              {puedeEditar && !g.plan &&
                                                (posicionPorLiberar === p.posicion ? (
                                                  <span className="inline-flex items-center gap-2">
                                                    <button
                                                      onClick={() => setPosicionPorLiberar(null)}
                                                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                                                    >
                                                      Cancelar
                                                    </button>
                                                    <button
                                                      onClick={() => liberar(p.posicion, g.despachoCabId)}
                                                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-700 text-white hover:bg-red-800"
                                                    >
                                                      Sí, liberar
                                                    </button>
                                                  </span>
                                                ) : (
                                                  <button
                                                    onClick={() => setPosicionPorLiberar(p.posicion)}
                                                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100"
                                                  >
                                                    Liberar
                                                  </button>
                                                ))}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                  {g.plan && (
                                    <p className="text-xs text-blue-700 bg-blue-50 rounded-md px-2.5 py-1.5">
                                      La guía está en el plan {g.plan}: no se pueden cambiar sus posiciones hasta cancelarlo.
                                    </p>
                                  )}
                                  {puedeEditar && !g.plan && (
                                    <div className="flex items-center gap-2 mt-2">
                                      <input
                                        type="text"
                                        value={formPosicion}
                                        onChange={(e) => setFormPosicion(e.target.value.toUpperCase())}
                                        placeholder="Ej: N201F02C001"
                                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-mono w-44 outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                      <button
                                        onClick={() => registrar(g.despachoCabId)}
                                        disabled={guardando || !formPosicion.trim() || detalle.contenedores.length === 0}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                          guardando || !formPosicion.trim() || detalle.contenedores.length === 0
                                            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                            : "bg-blue-600 text-white hover:bg-blue-700"
                                        }`}
                                      >
                                        {guardando ? "Guardando..." : "Registrar posición"}
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="bg-white rounded-lg border border-slate-200 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-bold text-slate-700">
                                      Contenedores de la guía ({detalle.contenedores.length})
                                    </p>
                                    <button
                                      onClick={() => setVerPacking((v) => !v)}
                                      className="text-xs font-semibold text-blue-600 hover:underline"
                                    >
                                      {verPacking ? "Ocultar packing list" : "Ver packing list"}
                                    </button>
                                  </div>
                                  <div className="max-h-64 overflow-y-auto">
                                    {!verPacking ? (
                                      <table className="w-full text-sm">
                                        <thead className="text-slate-500 font-medium text-left">
                                          <tr><th className="py-1.5 pr-3">Contenedor</th><th className="py-1.5 pr-3">Unid.</th><th className="py-1.5">Remito</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {detalle.contenedores.map((c) => (
                                            <tr key={c.contenedor}>
                                              <td className="py-1.5 pr-3 font-mono text-slate-800">{c.contenedor}</td>
                                              <td className="py-1.5 pr-3 text-slate-600">{c.unidades ?? ""}</td>
                                              <td className="py-1.5 font-mono text-slate-600">{c.remito ?? ""}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <table className="w-full text-sm">
                                        <thead className="text-slate-500 font-medium text-left">
                                          <tr><th className="py-1.5 pr-3">Contenedor</th><th className="py-1.5 pr-3">SKU</th><th className="py-1.5">Cant.</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {detalle.packing.map((p, i) => (
                                            <tr key={`${p.contenedor}-${p.sku}-${i}`}>
                                              <td className="py-1.5 pr-3 font-mono text-slate-800">{p.contenedor}</td>
                                              <td className="py-1.5 pr-3 font-mono text-slate-600">{p.sku}</td>
                                              <td className="py-1.5 text-slate-600">{p.cantidad ?? ""}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="text-slate-500 font-medium border-b border-slate-200">
                  <th className="py-3 px-4 text-left">Posición</th>
                  <th className="py-3 px-4 text-left">Guía</th>
                  <th className="py-3 px-4 text-left">Cliente</th>
                  <th className="py-3 px-4 text-left">Plan</th>
                  <th className="py-3 px-4 text-left">Registrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posicionesFiltradas.map((p) => (
                  <tr key={p.posicion}>
                    <td className="py-3 px-4 text-left font-bold text-slate-900 font-mono">{p.posicion}</td>
                    <td className="py-3 px-4 text-left font-mono text-slate-700">{p.guia}</td>
                    <td className="py-3 px-4 text-left text-slate-700">{p.cliente}</td>
                    <td className="py-3 px-4 text-left">
                      {p.plan ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{p.plan}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-left text-xs text-slate-500">
                      {p.registradaEn ? fmtFecha(p.registradaEn) : ""}
                      {p.registradaPor ? ` · ${p.registradaPor}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isLoading &&
            ((vista === "guia" && guiasFiltradas.length === 0) || (vista === "posicion" && posicionesFiltradas.length === 0)) && (
              <p className="text-sm text-slate-400 text-center py-8">
                {hayFiltros
                  ? "No hay datos que coincidan con los filtros aplicados."
                  : vista === "guia"
                    ? "Todavía no hay guías: usá \"Importar guías pendientes (WMS)\"."
                    : "Todavía no hay posiciones ocupadas."}
              </p>
            )}
        </div>
      </div>
    </div>
  );
}

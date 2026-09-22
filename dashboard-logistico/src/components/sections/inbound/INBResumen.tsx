"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha, fmtSoloFecha, semanasDelAnio, type SemanaDelMes } from "@/components/dashboard/formatters";

interface InboundFila {
  legajo: number;
  proveedor: string | null;
  etapa: string | null;
  marca: string | null;
  unidades: number | null;
  fob_total_usd: number | null;
  transporte: string | null;
  tipo_carga: string | null;
  bultos: string | null;
  cbm: string | null;
  etd: string | null;
  eta: string | null;
  arribo_cd: string | null;
  status: string | null;
  updated_at: string | null;
}

interface InboundProductoFila {
  master: string | null;
  descripcion: string | null;
  marca: string | null;
  grupo: string | null;
}

export default function INBResumen() {
  const { activeTab, dataVersion, tienePermiso } = useDashboard();

  const {
    data: inboundData,
    error: inboundError,
    isLoading: inboundLoading,
    mutate: mutateInboundData,
  } = useTabData<{
    pendientes: InboundFila[];
    enCd: InboundFila[];
    updatedAt: string | null;
  }>(activeTab, "INB-Resumen", "/api/inbound/resumen", dataVersion);

  const [filtroLegajoPendientes, setFiltroLegajoPendientes] = useState("");
  const [filtroSemanaPendientes, setFiltroSemanaPendientes] = useState(""); // "" = todas las semanas
  const [filtroLegajoEnCd, setFiltroLegajoEnCd] = useState("");

  const { semanasConDatosInbound, pendientesFiltradosInbound, enCdFiltradosInbound, subtotalPendientesInbound } =
    useMemo(() => {
      // Solo mostramos en el desplegable las semanas que efectivamente tienen
      // algún legajo pendiente con ARRIBO AL CD en ese rango.
      const fechas = (inboundData?.pendientes ?? [])
        .map((f) => f.arribo_cd)
        .filter((f): f is string => !!f);

      let semanasConDatosInbound: SemanaDelMes[] = [];
      if (fechas.length > 0) {
        const minFecha = fechas.reduce((a, b) => (a < b ? a : b));
        const maxFecha = fechas.reduce((a, b) => (a > b ? a : b));
        const anioMin = Number(minFecha.slice(0, 4));
        const anioMax = Number(maxFecha.slice(0, 4));

        let todas: SemanaDelMes[] = [];
        for (let y = anioMin; y <= anioMax; y++) {
          todas = todas.concat(semanasDelAnio(y));
        }
        semanasConDatosInbound = todas.filter((s) => fechas.some((f) => f >= s.desde && f <= s.hasta));
      }

      const pendientesFiltradosInbound = (inboundData?.pendientes ?? [])
        .filter((f) => {
          if (filtroLegajoPendientes.trim() && !String(f.legajo).includes(filtroLegajoPendientes.trim())) return false;
          if (filtroSemanaPendientes) {
            const semana = semanasConDatosInbound.find((s) => s.desde === filtroSemanaPendientes);
            if (!semana) return false;
            if (!f.arribo_cd || f.arribo_cd < semana.desde || f.arribo_cd > semana.hasta) return false;
          }
          return true;
        })
        // Primero por Arribo CD (sin fecha al final), después por Legajo.
        .sort((a, b) => {
          if (!a.arribo_cd && !b.arribo_cd) return a.legajo - b.legajo;
          if (!a.arribo_cd) return 1;
          if (!b.arribo_cd) return -1;
          if (a.arribo_cd !== b.arribo_cd) return a.arribo_cd < b.arribo_cd ? -1 : 1;
          return a.legajo - b.legajo;
        });

      const enCdFiltradosInbound = (inboundData?.enCd ?? []).filter(
        (f) => !filtroLegajoEnCd.trim() || String(f.legajo).includes(filtroLegajoEnCd.trim())
      );

      // Subtotal de "Por arribar al CD" sobre lo ya filtrado. Bultos/CBM son
      // texto (a veces "A CONFIRMAR") -- solo se suman los valores numéricos.
      let unidades = 0;
      let bultos = 0;
      let cbm = 0;
      for (const f of pendientesFiltradosInbound) {
        unidades += f.unidades ?? 0;
        const b = Number(f.bultos);
        if (Number.isFinite(b)) bultos += b;
        const c = Number(f.cbm);
        if (Number.isFinite(c)) cbm += c;
      }
      const subtotalPendientesInbound = { legajos: pendientesFiltradosInbound.length, unidades, bultos, cbm };

      return { semanasConDatosInbound, pendientesFiltradosInbound, enCdFiltradosInbound, subtotalPendientesInbound };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inboundData, filtroLegajoPendientes, filtroSemanaPendientes, filtroLegajoEnCd]);

  // --- Edición de ARRIBO CD + botón "marcar arribado" (solo INB-EditarArribo) ---
  const [editandoArriboLegajo, setEditandoArriboLegajo] = useState<number | null>(null);
  const [valorArriboEdit, setValorArriboEdit] = useState("");
  const [guardandoArribo, setGuardandoArribo] = useState(false);
  const [accionInboundError, setAccionInboundError] = useState<string | null>(null);

  const iniciarEdicionArribo = (legajo: number, valorActual: string | null) => {
    setEditandoArriboLegajo(legajo);
    setValorArriboEdit(valorActual || "");
    setAccionInboundError(null);
  };

  const guardarArribo = async (legajo: number) => {
    if (!valorArriboEdit) {
      setEditandoArriboLegajo(null);
      return;
    }
    setGuardandoArribo(true);
    setAccionInboundError(null);
    try {
      const res = await fetch("/api/inbound/arribo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legajo, arriboCd: valorArriboEdit }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar la fecha.");
      await mutateInboundData(
        (prev) =>
          prev
            ? {
                ...prev,
                pendientes: prev.pendientes.map((f) =>
                  f.legajo === legajo ? { ...f, arribo_cd: valorArriboEdit } : f
                ),
              }
            : prev,
        { revalidate: false }
      );
      setEditandoArriboLegajo(null);
    } catch (err) {
      setAccionInboundError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoArribo(false);
    }
  };

  const marcarArriboCD = async (legajo: number) => {
    if (!confirm(`¿Confirmás que el legajo ${legajo} llegó al CD? Se moverá a la tabla "En CD".`)) return;
    setAccionInboundError(null);
    try {
      const res = await fetch("/api/inbound/marcar-cd", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legajo }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo actualizar el status.");
      await mutateInboundData(
        (prev) => {
          if (!prev) return prev;
          const fila = prev.pendientes.find((f) => f.legajo === legajo);
          if (!fila) return prev;
          const filaCd = { ...fila, status: "CD" };
          return {
            ...prev,
            pendientes: prev.pendientes.filter((f) => f.legajo !== legajo),
            enCd: [...prev.enCd, filaCd].sort((a, b) => a.legajo - b.legajo),
          };
        },
        { revalidate: false }
      );
    } catch (err) {
      setAccionInboundError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  // --- Detalle de productos por legajo (desplegable al hacer click en el LEGAJO) ---
  const [legajoExpandidoInbound, setLegajoExpandidoInbound] = useState<number | null>(null);
  const [productosPorLegajo, setProductosPorLegajo] = useState<Map<number, InboundProductoFila[]>>(new Map());
  const [legajoProductosLoading, setLegajoProductosLoading] = useState<number | null>(null);
  const [legajoProductosError, setLegajoProductosError] = useState<string | null>(null);

  const toggleLegajoInbound = async (legajo: number) => {
    if (legajoExpandidoInbound === legajo) {
      setLegajoExpandidoInbound(null);
      return;
    }
    setLegajoExpandidoInbound(legajo);
    setLegajoProductosError(null);

    if (productosPorLegajo.has(legajo)) return; // ya lo teníamos en caché

    setLegajoProductosLoading(legajo);
    try {
      const res = await fetch(`/api/inbound/productos?legajo=${legajo}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el detalle de productos.");
      setProductosPorLegajo((prev) => new Map(prev).set(legajo, data.productos));
    } catch (err) {
      setLegajoProductosError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLegajoProductosLoading(null);
    }
  };

  const [exportandoInboundPendientes, setExportandoInboundPendientes] = useState(false);

  const exportarInboundPendientesExcel = async () => {
    setExportandoInboundPendientes(true);
    try {
      const XLSX = await import("xlsx");

      // "Resumen" = exactamente lo que se ve en pantalla en la tabla (una fila por legajo).
      const filasResumen = pendientesFiltradosInbound.map((f) => ({
        Legajo: f.legajo,
        Etapa: f.etapa,
        Marca: f.marca,
        Unidades: f.unidades,
        "Tipo Carga": f.tipo_carga,
        Bultos: f.bultos,
        CBM: f.cbm,
        ETD: fmtSoloFecha(f.etd),
        ETA: fmtSoloFecha(f.eta),
        "Arribo CD": fmtSoloFecha(f.arribo_cd),
        Status: f.status,
      }));

      // "Detalle" = el detalle de productos por legajo, lo mismo que se ve al
      // hacer click en cada fila -- se completa el caché con los legajos que
      // todavía no se hayan desplegado en pantalla.
      const legajosFaltantes = pendientesFiltradosInbound
        .map((f) => f.legajo)
        .filter((legajo) => !productosPorLegajo.has(legajo));

      const productosCompletos = new Map(productosPorLegajo);
      if (legajosFaltantes.length > 0) {
        const traidos = await Promise.all(
          legajosFaltantes.map(async (legajo) => {
            try {
              const res = await fetch(`/api/inbound/productos?legajo=${legajo}`, { cache: "no-store" });
              const data = await res.json();
              return { legajo, productos: res.ok && data.success ? (data.productos as InboundProductoFila[]) : [] };
            } catch {
              return { legajo, productos: [] as InboundProductoFila[] };
            }
          })
        );
        for (const { legajo, productos } of traidos) productosCompletos.set(legajo, productos);
        setProductosPorLegajo(productosCompletos);
      }

      const filasDetalle = [...pendientesFiltradosInbound]
        .sort((a, b) => a.legajo - b.legajo)
        .flatMap((f) =>
          (productosCompletos.get(f.legajo) ?? []).map((p) => ({
            Legajo: f.legajo,
            Marca: p.marca,
            Grupo: p.grupo,
            Master: p.master,
            Descripción: p.descripcion,
          }))
        );

      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasResumen), "Resumen");
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasDetalle), "Detalle");
      const fechaArchivo = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(libro, `inbound_por_arribar_cd_${fechaArchivo}.xlsx`);
    } finally {
      setExportandoInboundPendientes(false);
    }
  };

  return (
    <div className="space-y-6">
      {inboundError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar Inbound: {inboundError}
        </div>
      )}
      {accionInboundError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {accionInboundError}
        </div>
      )}
      {inboundLoading && !inboundData && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <SkeletonTable rows={6} columns={7} />
        </div>
      )}

      {/* --- TARJETA: POR ARRIBAR AL CD --- */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-800">Por arribar al CD</h2>
          {inboundData && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(inboundData.updatedAt)}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-4">Todos los legajos cuyo STATUS todavía no es CD.</p>

        {/* FILTROS */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <input
            type="text"
            value={filtroLegajoPendientes}
            onChange={(e) => setFiltroLegajoPendientes(e.target.value)}
            placeholder="Buscar por legajo..."
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-48"
          />
          <select
            value={filtroSemanaPendientes}
            onChange={(e) => setFiltroSemanaPendientes(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">Todas las semanas</option>
            {semanasConDatosInbound.map((s) => (
              <option key={s.desde} value={s.desde}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={() => {
              setFiltroLegajoPendientes("");
              setFiltroSemanaPendientes("");
            }}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Limpiar filtros
          </button>

          <button
            onClick={exportarInboundPendientesExcel}
            disabled={pendientesFiltradosInbound.length === 0 || exportandoInboundPendientes}
            className={`ml-auto px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              pendientesFiltradosInbound.length === 0 || exportandoInboundPendientes
                ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {exportandoInboundPendientes ? "Exportando..." : "Exportar a Excel"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              {pendientesFiltradosInbound.length > 0 && (
                <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                  <td className="py-3 px-4 text-left" colSpan={3}>
                    Subtotal — {subtotalPendientesInbound.legajos} legajo{subtotalPendientesInbound.legajos === 1 ? "" : "s"}
                  </td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotalPendientesInbound.unidades)}</td>
                  <td className="py-3 px-4 text-left"></td>
                  <td className="py-3 px-4 text-left">{fmtNum(subtotalPendientesInbound.bultos)}</td>
                  <td className="py-3 px-4 text-left">
                    {subtotalPendientesInbound.cbm.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td colSpan={tienePermiso("INB-EditarArribo") ? 5 : 4}></td>
                </tr>
              )}
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Legajo</th>
                <th className="py-3 px-4 text-left">Etapa</th>
                <th className="py-3 px-4 text-left">Marca</th>
                <th className="py-3 px-4 text-left">Unidades</th>
                <th className="py-3 px-4 text-left">Tipo Carga</th>
                <th className="py-3 px-4 text-left">Bultos</th>
                <th className="py-3 px-4 text-left">CBM</th>
                <th className="py-3 px-4 text-left">ETD</th>
                <th className="py-3 px-4 text-left">ETA</th>
                <th className="py-3 px-4 text-left">Arribo CD</th>
                <th className="py-3 px-4 text-left">Status</th>
                {tienePermiso("INB-EditarArribo") && <th className="py-3 px-4 text-left">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendientesFiltradosInbound.map((f) => (
                <>
                <tr key={f.legajo} className="hover:bg-slate-50">
                  <td className="py-3 px-4 text-left">
                    <button
                      onClick={() => toggleLegajoInbound(f.legajo)}
                      className="font-bold text-blue-600 hover:underline"
                      title="Ver detalle de productos"
                    >
                      {f.legajo}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.etapa || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.marca || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(f.unidades ?? 0)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.tipo_carga || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.bultos || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.cbm || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.etd)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.eta)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">
                    {tienePermiso("INB-EditarArribo") && editandoArriboLegajo === f.legajo ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={valorArriboEdit}
                          onChange={(e) => setValorArriboEdit(e.target.value)}
                          className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => guardarArribo(f.legajo)}
                          disabled={guardandoArribo}
                          className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setEditandoArriboLegajo(null)}
                          disabled={guardandoArribo}
                          className="text-xs text-slate-400 hover:underline disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : tienePermiso("INB-EditarArribo") ? (
                      <button
                        onClick={() => iniciarEdicionArribo(f.legajo, f.arribo_cd)}
                        className="hover:underline hover:text-blue-600"
                        title="Editar fecha de arribo"
                      >
                        {fmtSoloFecha(f.arribo_cd)}
                      </button>
                    ) : (
                      fmtSoloFecha(f.arribo_cd)
                    )}
                  </td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.status || "—"}</td>
                  {tienePermiso("INB-EditarArribo") && (
                    <td className="py-3 px-4 text-left">
                      <button
                        onClick={() => marcarArriboCD(f.legajo)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        Marcar arribado a CD
                      </button>
                    </td>
                  )}
                </tr>

                {legajoExpandidoInbound === f.legajo && (
                  <tr>
                    <td colSpan={tienePermiso("INB-EditarArribo") ? 12 : 11} className="bg-slate-50 px-4 py-4">
                      <p className="text-xs font-semibold text-slate-500 mb-2">
                        Detalle de productos — Legajo {f.legajo}
                      </p>
                      {legajoProductosError && (
                        <p className="text-sm text-red-600 mb-2">{legajoProductosError}</p>
                      )}
                      {legajoProductosLoading === f.legajo && (
                        <p className="text-sm text-slate-400">Cargando detalle...</p>
                      )}
                      {legajoProductosLoading !== f.legajo && (
                        <>
                          {(productosPorLegajo.get(f.legajo) ?? []).length === 0 ? (
                            <p className="text-sm text-slate-400">
                              No hay detalle de productos importado para este legajo.
                            </p>
                          ) : (
                            <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                              <thead className="text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                  <th className="py-2 px-3 text-left">Marca</th>
                                  <th className="py-2 px-3 text-left">Grupo</th>
                                  <th className="py-2 px-3 text-left">Master</th>
                                  <th className="py-2 px-3 text-left">Descripción</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(productosPorLegajo.get(f.legajo) ?? []).map((p, pi) => (
                                  <tr key={pi}>
                                    <td className="py-2 px-3 text-left font-medium text-slate-700">{p.marca || "—"}</td>
                                    <td className="py-2 px-3 text-left text-slate-600">{p.grupo || "—"}</td>
                                    <td className="py-2 px-3 text-left text-slate-600">{p.master || "—"}</td>
                                    <td className="py-2 px-3 text-left text-slate-600">{p.descripcion || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
          {pendientesFiltradosInbound.length === 0 && !inboundLoading && (
            <p className="text-sm text-slate-400 text-center py-8">No hay legajos que coincidan con los filtros aplicados.</p>
          )}
        </div>
      </div>

      {/* --- TARJETA: EN CD --- */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-1">En CD</h2>
        <p className="text-sm text-slate-500 mb-4">Todos los legajos cuyo STATUS ya es CD.</p>

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <input
            type="text"
            value={filtroLegajoEnCd}
            onChange={(e) => setFiltroLegajoEnCd(e.target.value)}
            placeholder="Buscar por legajo..."
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-48"
          />
          <button
            onClick={() => setFiltroLegajoEnCd("")}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Limpiar filtro
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Legajo</th>
                <th className="py-3 px-4 text-left">Etapa</th>
                <th className="py-3 px-4 text-left">Marca</th>
                <th className="py-3 px-4 text-left">Unidades</th>
                <th className="py-3 px-4 text-left">Tipo Carga</th>
                <th className="py-3 px-4 text-left">Bultos</th>
                <th className="py-3 px-4 text-left">CBM</th>
                <th className="py-3 px-4 text-left">ETD</th>
                <th className="py-3 px-4 text-left">ETA</th>
                <th className="py-3 px-4 text-left">Arribo CD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enCdFiltradosInbound.map((f) => (
                <tr key={f.legajo} className="hover:bg-slate-50">
                  <td className="py-3 px-4 text-left font-bold text-slate-900">{f.legajo}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.etapa || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.marca || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(f.unidades ?? 0)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.tipo_carga || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.bultos || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.cbm || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.etd)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.eta)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtSoloFecha(f.arribo_cd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {enCdFiltradosInbound.length === 0 && !inboundLoading && (
            <p className="text-sm text-slate-400 text-center py-8">No hay legajos que coincidan con el filtro aplicado.</p>
          )}
        </div>
      </div>
    </div>
  );
}

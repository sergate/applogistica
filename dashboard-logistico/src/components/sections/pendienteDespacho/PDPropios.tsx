"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha } from "@/components/dashboard/formatters";

interface PDPropiosFila {
  numero: string;
  codigoCliente: string;
  cliente: string;
  canal: string;
  tipo: string;
  curva: string;
  grupos: string[];
  unidades: number;
}

export default function PDPropios() {
  const { activeTab, dataVersion } = useDashboard();

  const {
    data: pdPropiosData,
    error: pdPropiosError,
    isLoading: pdPropiosLoading,
  } = useTabData<{ filas: PDPropiosFila[]; updatedAt: string | null }>(
    activeTab,
    "PD-Propios",
    "/api/pendiente-despacho/propios/resumen",
    dataVersion
  );

  const [filtroCanalPDP, setFiltroCanalPDP] = useState("TODAS");
  const [filtroTipoPDP, setFiltroTipoPDP] = useState("TODAS");
  // Selección múltiple: array vacío = sin filtrar (todas las curvas).
  const [filtroCurvaPDP, setFiltroCurvaPDP] = useState<string[]>([]);
  const [curvaDropdownAbiertoPDP, setCurvaDropdownAbiertoPDP] = useState(false);
  const curvaDropdownRefPDP = useRef<HTMLDivElement>(null);
  const [filtroGrupoPDP, setFiltroGrupoPDP] = useState("TODOS");
  const [filtroClientePDP, setFiltroClientePDP] = useState("");
  const [clienteExpandidoPDP, setClienteExpandidoPDP] = useState<string | null>(null);

  const canalesDisponiblesPDP = Array.from(new Set((pdPropiosData?.filas ?? []).map((f) => f.canal))).sort();
  const tiposDisponiblesPDP = Array.from(new Set((pdPropiosData?.filas ?? []).map((f) => f.tipo))).sort();
  const curvasDisponiblesPDP = Array.from(new Set((pdPropiosData?.filas ?? []).map((f) => f.curva))).sort();
  const gruposDisponiblesPDP = Array.from(
    new Set((pdPropiosData?.filas ?? []).flatMap((f) => (f.grupos.length > 0 ? f.grupos : ["SIN GRUPO"])))
  ).sort();

  const toggleFiltroCurvaPDP = (curva: string) => {
    setFiltroCurvaPDP((prev) => (prev.includes(curva) ? prev.filter((c) => c !== curva) : [...prev, curva]));
  };

  useEffect(() => {
    if (!curvaDropdownAbiertoPDP) return;
    const onClickFuera = (e: MouseEvent) => {
      if (curvaDropdownRefPDP.current && !curvaDropdownRefPDP.current.contains(e.target as Node)) {
        setCurvaDropdownAbiertoPDP(false);
      }
    };
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [curvaDropdownAbiertoPDP]);

  const { filasFiltradasPDP, filasTablaPDP, subtotalPDP } = useMemo(() => {
    const filasFiltradasPDP = (pdPropiosData?.filas ?? []).filter(
      (f) =>
        (filtroCanalPDP === "TODAS" || f.canal === filtroCanalPDP) &&
        (filtroTipoPDP === "TODAS" || f.tipo === filtroTipoPDP) &&
        (filtroCurvaPDP.length === 0 || filtroCurvaPDP.includes(f.curva)) &&
        (filtroGrupoPDP === "TODOS" || (f.grupos.length > 0 ? f.grupos : ["SIN GRUPO"]).includes(filtroGrupoPDP)) &&
        (!filtroClientePDP.trim() || f.cliente.toLowerCase().includes(filtroClientePDP.trim().toLowerCase()))
    );

    const consolidadoClientesPDP = new Map<
      string,
      { codigoCliente: string; cliente: string; canal: string; grupos: string[]; cajas: number; unidades: number }
    >();
    for (const f of filasFiltradasPDP) {
      if (!consolidadoClientesPDP.has(f.codigoCliente)) {
        consolidadoClientesPDP.set(f.codigoCliente, {
          codigoCliente: f.codigoCliente,
          cliente: f.cliente,
          canal: f.canal,
          grupos: f.grupos,
          cajas: 0,
          unidades: 0,
        });
      }
      const acc = consolidadoClientesPDP.get(f.codigoCliente)!;
      acc.cajas += 1;
      acc.unidades += f.unidades;
    }

    const filasTablaPDP = Array.from(consolidadoClientesPDP.values()).sort((a, b) =>
      a.canal !== b.canal ? a.canal.localeCompare(b.canal) : a.cliente.localeCompare(b.cliente)
    );

    const subtotalPDP = filasTablaPDP.reduce(
      (acc, f) => ({ cajas: acc.cajas + f.cajas, unidades: acc.unidades + f.unidades }),
      { cajas: 0, unidades: 0 }
    );

    return { filasFiltradasPDP, filasTablaPDP, subtotalPDP };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdPropiosData, filtroCanalPDP, filtroTipoPDP, filtroCurvaPDP, filtroGrupoPDP, filtroClientePDP]);

  const detalleClienteExpandidoPDP = useMemo(
    () => (clienteExpandidoPDP ? filasFiltradasPDP.filter((f) => f.codigoCliente === clienteExpandidoPDP) : []),
    [filasFiltradasPDP, clienteExpandidoPDP]
  );

  const handleClienteClickPDP = (codigoCliente: string) => {
    setClienteExpandidoPDP(clienteExpandidoPDP === codigoCliente ? null : codigoCliente);
  };

  const exportarPDPropiosExcel = async () => {
    const XLSX = await import("xlsx");
    const filasResumen = filasTablaPDP.map((f) => ({
      Canal: f.canal,
      Cliente: f.cliente,
      Grupo: f.grupos.join(", "),
      Cajas: f.cajas,
      Unidades: f.unidades,
    }));
    const filasDetalle = filasFiltradasPDP.map((f) => ({
      Número: f.numero,
      Canal: f.canal,
      Cliente: f.cliente,
      Grupo: f.grupos.join(", "),
      Tipo: f.tipo,
      Curva: f.curva,
      Unidades: f.unidades,
    }));

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasResumen), "Resumen");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasDetalle), "Detalle");
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(libro, `pendiente_despacho_propios_${fechaArchivo}.xlsx`);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800">Pendiente de Despacho — Propios</h2>
        {pdPropiosData && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(pdPropiosData.updatedAt)}</span>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Solo se consideran las líneas sin Remito. Hacé click en un cliente para ver el detalle por caja.
      </p>

      {/* FILTROS */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={filtroCanalPDP}
          onChange={(e) => setFiltroCanalPDP(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODAS">Todos los canales</option>
          {canalesDisponiblesPDP.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filtroTipoPDP}
          onChange={(e) => setFiltroTipoPDP(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODAS">Todos los tipos</option>
          {tiposDisponiblesPDP.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="relative" ref={curvaDropdownRefPDP}>
          <button
            type="button"
            onClick={() => setCurvaDropdownAbiertoPDP((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            {filtroCurvaPDP.length === 0
              ? "Todas las curvas"
              : `${filtroCurvaPDP.length} curva${filtroCurvaPDP.length === 1 ? "" : "s"} seleccionada${filtroCurvaPDP.length === 1 ? "" : "s"}`}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {curvaDropdownAbiertoPDP && (
            <div className="absolute z-10 mt-1 w-56 max-h-72 overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-lg p-2">
              <button
                type="button"
                onClick={() => setFiltroCurvaPDP(filtroCurvaPDP.length === curvasDisponiblesPDP.length ? [] : curvasDisponiblesPDP)}
                className="w-full text-left px-2 py-1.5 rounded text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                {filtroCurvaPDP.length === curvasDisponiblesPDP.length ? "Deseleccionar todas" : "Seleccionar todas"}
              </button>
              <div className="border-t border-slate-100 my-1" />
              {curvasDisponiblesPDP.map((c) => (
                <label key={c} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={filtroCurvaPDP.includes(c)}
                    onChange={() => toggleFiltroCurvaPDP(c)}
                    className="w-3.5 h-3.5"
                  />
                  {c}
                </label>
              ))}
            </div>
          )}
        </div>

        <select
          value={filtroGrupoPDP}
          onChange={(e) => setFiltroGrupoPDP(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODOS">Todos los grupos</option>
          {gruposDisponiblesPDP.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <input
          type="text"
          value={filtroClientePDP}
          onChange={(e) => setFiltroClientePDP(e.target.value)}
          placeholder="Buscar por cliente..."
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-56"
        />

        <button
          onClick={() => {
            setFiltroCanalPDP("TODAS");
            setFiltroTipoPDP("TODAS");
            setFiltroCurvaPDP([]);
            setFiltroGrupoPDP("TODOS");
            setFiltroClientePDP("");
          }}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          Limpiar filtros
        </button>

        <button
          onClick={exportarPDPropiosExcel}
          disabled={filasFiltradasPDP.length === 0}
          className={`ml-auto px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filasFiltradasPDP.length === 0
              ? "bg-slate-100 text-slate-300 cursor-not-allowed"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          Exportar a Excel
        </button>
      </div>

      {pdPropiosError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar el resumen: {pdPropiosError}
        </div>
      )}
      {pdPropiosLoading && !pdPropiosData && (
        <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
          <SkeletonTable rows={6} columns={6} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead>
            {filasTablaPDP.length > 0 && (
              <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                <td className="py-3 px-4 text-left" colSpan={3}>
                  Subtotal — {filasTablaPDP.length} cliente{filasTablaPDP.length === 1 ? "" : "s"}
                </td>
                <td className="py-3 px-4 text-left">{fmtNum(subtotalPDP.cajas)}</td>
                <td className="py-3 px-4 text-left">{fmtNum(subtotalPDP.unidades)}</td>
              </tr>
            )}
            <tr className="text-slate-500 font-medium border-b border-slate-200">
              <th className="py-3 px-4 text-left">Canal</th>
              <th className="py-3 px-4 text-left">Cliente</th>
              <th className="py-3 px-4 text-left">Grupo</th>
              <th className="py-3 px-4 text-left">Cajas</th>
              <th className="py-3 px-4 text-left">Unidades</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filasTablaPDP.map((row) => {
              const estaExpandido = clienteExpandidoPDP === row.codigoCliente;
              return (
                <>
                <tr
                  key={row.codigoCliente}
                  onClick={() => handleClienteClickPDP(row.codigoCliente)}
                  className={`cursor-pointer transition-colors ${estaExpandido ? "bg-slate-100" : "hover:bg-slate-50"}`}
                >
                  <td className="py-3 px-4 text-left font-bold text-slate-900">{row.canal}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{row.cliente}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{row.grupos.length > 0 ? row.grupos.join(", ") : "-"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.cajas)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.unidades)}</td>
                </tr>

                {estaExpandido && (
                  <tr>
                    <td colSpan={5} className="bg-slate-50 px-4 py-4">
                      <p className="text-xs font-semibold text-slate-500 mb-2">
                        Detalle por caja — {row.cliente}
                      </p>
                      <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                        <thead className="text-slate-500 font-medium border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 text-left">Número</th>
                            <th className="py-2 px-3 text-left">Tipo</th>
                            <th className="py-2 px-3 text-left">Curva</th>
                            <th className="py-2 px-3 text-left">Canal</th>
                            <th className="py-2 px-3 text-left">Cliente</th>
                            <th className="py-2 px-3 text-left">Unidades</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detalleClienteExpandidoPDP.map((d) => (
                            <tr key={d.numero}>
                              <td className="py-2 px-3 text-left font-medium text-slate-700">{d.numero}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.tipo}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.curva}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.canal}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.cliente}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{fmtNum(d.unidades)}</td>
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
        {filasTablaPDP.length === 0 && !pdPropiosLoading && (
          <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
        )}
      </div>
    </div>
  );
}

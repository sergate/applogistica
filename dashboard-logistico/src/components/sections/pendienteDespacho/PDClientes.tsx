"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha } from "@/components/dashboard/formatters";

interface PDClienteFila {
  numero: string;
  codigoCliente: string;
  cliente: string;
  canal: string;
  tipo: string;
  curva: string;
  temporada: string;
  unidades: number;
}

export default function PDClientes() {
  const { activeTab, dataVersion } = useDashboard();

  const {
    data: pdClientesData,
    error: pdClientesError,
    isLoading: pdClientesLoading,
  } = useTabData<{ filas: PDClienteFila[]; updatedAt: string | null }>(
    activeTab,
    "PD-Clientes",
    "/api/pendiente-despacho/clientes/resumen",
    dataVersion
  );

  const [filtroCanalPD, setFiltroCanalPD] = useState("TODAS");
  const [filtroTipoPD, setFiltroTipoPD] = useState("TODAS");
  const [filtroCurvaPD, setFiltroCurvaPD] = useState("TODAS");
  const [filtroClientePD, setFiltroClientePD] = useState("");
  const [clienteExpandidoPD, setClienteExpandidoPD] = useState<string | null>(null);

  const canalesDisponiblesPD = Array.from(new Set((pdClientesData?.filas ?? []).map((f) => f.canal))).sort();
  const tiposDisponiblesPD = Array.from(new Set((pdClientesData?.filas ?? []).map((f) => f.tipo))).sort();
  const curvasDisponiblesPD = Array.from(new Set((pdClientesData?.filas ?? []).map((f) => f.curva))).sort();

  const { filasFiltradasPD, filasTablaPD, subtotalPD } = useMemo(() => {
    const filasFiltradasPD = (pdClientesData?.filas ?? []).filter(
      (f) =>
        (filtroCanalPD === "TODAS" || f.canal === filtroCanalPD) &&
        (filtroTipoPD === "TODAS" || f.tipo === filtroTipoPD) &&
        (filtroCurvaPD === "TODAS" || f.curva === filtroCurvaPD) &&
        (!filtroClientePD.trim() || f.cliente.toLowerCase().includes(filtroClientePD.trim().toLowerCase()))
    );

    // Una fila por cliente: Cajas = cantidad de líneas (cada línea es una caja),
    // Unidades = suma de unidades de esas líneas.
    const consolidadoClientesPD = new Map<
      string,
      { codigoCliente: string; cliente: string; canal: string; cajas: number; unidades: number }
    >();
    for (const f of filasFiltradasPD) {
      if (!consolidadoClientesPD.has(f.codigoCliente)) {
        consolidadoClientesPD.set(f.codigoCliente, {
          codigoCliente: f.codigoCliente,
          cliente: f.cliente,
          canal: f.canal,
          cajas: 0,
          unidades: 0,
        });
      }
      const acc = consolidadoClientesPD.get(f.codigoCliente)!;
      acc.cajas += 1;
      acc.unidades += f.unidades;
    }

    const filasTablaPD = Array.from(consolidadoClientesPD.values()).sort((a, b) =>
      a.canal !== b.canal ? a.canal.localeCompare(b.canal) : a.cliente.localeCompare(b.cliente)
    );

    const subtotalPD = filasTablaPD.reduce(
      (acc, f) => ({ cajas: acc.cajas + f.cajas, unidades: acc.unidades + f.unidades }),
      { cajas: 0, unidades: 0 }
    );

    return { filasFiltradasPD, filasTablaPD, subtotalPD };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdClientesData, filtroCanalPD, filtroTipoPD, filtroCurvaPD, filtroClientePD]);

  const detalleClienteExpandidoPD = useMemo(
    () => (clienteExpandidoPD ? filasFiltradasPD.filter((f) => f.codigoCliente === clienteExpandidoPD) : []),
    [filasFiltradasPD, clienteExpandidoPD]
  );

  const handleClienteClickPD = (codigoCliente: string) => {
    setClienteExpandidoPD(clienteExpandidoPD === codigoCliente ? null : codigoCliente);
  };

  // Un solo archivo, dos hojas: "Resumen" (una fila por cliente) y "Detalle"
  // (una fila por caja) -- ambas sobre los datos ya filtrados en pantalla.
  const exportarPDExcel = async () => {
    const XLSX = await import("xlsx");
    const filasResumen = filasTablaPD.map((f) => ({
      Canal: f.canal,
      Cliente: f.cliente,
      Cajas: f.cajas,
      Unidades: f.unidades,
    }));
    const filasDetalle = filasFiltradasPD.map((f) => ({
      Número: f.numero,
      Canal: f.canal,
      Cliente: f.cliente,
      Tipo: f.tipo,
      Curva: f.curva,
      Temporada: f.temporada,
      Unidades: f.unidades,
    }));

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasResumen), "Resumen");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasDetalle), "Detalle");
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(libro, `pendiente_despacho_clientes_${fechaArchivo}.xlsx`);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800">Pendiente de Despacho — Clientes</h2>
        {pdClientesData && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(pdClientesData.updatedAt)}</span>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Solo se consideran las líneas con Pedido gaci. cargado y sin Remito. Hacé click en un cliente para
        ver el detalle por caja.
      </p>

      {/* FILTROS */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={filtroCanalPD}
          onChange={(e) => setFiltroCanalPD(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODAS">Todos los canales</option>
          {canalesDisponiblesPD.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filtroTipoPD}
          onChange={(e) => setFiltroTipoPD(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODAS">Todos los tipos</option>
          {tiposDisponiblesPD.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={filtroCurvaPD}
          onChange={(e) => setFiltroCurvaPD(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODAS">Todas las curvas</option>
          {curvasDisponiblesPD.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <input
          type="text"
          value={filtroClientePD}
          onChange={(e) => setFiltroClientePD(e.target.value)}
          placeholder="Buscar por cliente..."
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-56"
        />

        <button
          onClick={() => {
            setFiltroCanalPD("TODAS");
            setFiltroTipoPD("TODAS");
            setFiltroCurvaPD("TODAS");
            setFiltroClientePD("");
          }}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          Limpiar filtros
        </button>

        <button
          onClick={exportarPDExcel}
          disabled={filasFiltradasPD.length === 0}
          className={`ml-auto px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filasFiltradasPD.length === 0
              ? "bg-slate-100 text-slate-300 cursor-not-allowed"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          Exportar a Excel
        </button>
      </div>

      {pdClientesError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar el resumen: {pdClientesError}
        </div>
      )}
      {pdClientesLoading && !pdClientesData && (
        <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
          <SkeletonTable rows={6} columns={6} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead>
            {filasTablaPD.length > 0 && (
              <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                <td className="py-3 px-4 text-left" colSpan={2}>
                  Subtotal — {filasTablaPD.length} cliente{filasTablaPD.length === 1 ? "" : "s"}
                </td>
                <td className="py-3 px-4 text-left">{fmtNum(subtotalPD.cajas)}</td>
                <td className="py-3 px-4 text-left">{fmtNum(subtotalPD.unidades)}</td>
              </tr>
            )}
            <tr className="text-slate-500 font-medium border-b border-slate-200">
              <th className="py-3 px-4 text-left">Canal</th>
              <th className="py-3 px-4 text-left">Cliente</th>
              <th className="py-3 px-4 text-left">Cajas</th>
              <th className="py-3 px-4 text-left">Unidades</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filasTablaPD.map((row) => {
              const estaExpandido = clienteExpandidoPD === row.codigoCliente;
              return (
                <>
                <tr
                  key={row.codigoCliente}
                  onClick={() => handleClienteClickPD(row.codigoCliente)}
                  className={`cursor-pointer transition-colors ${estaExpandido ? "bg-slate-100" : "hover:bg-slate-50"}`}
                >
                  <td className="py-3 px-4 text-left font-bold text-slate-900">{row.canal}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{row.cliente}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.cajas)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.unidades)}</td>
                </tr>

                {estaExpandido && (
                  <tr>
                    <td colSpan={4} className="bg-slate-50 px-4 py-4">
                      <p className="text-xs font-semibold text-slate-500 mb-2">
                        Detalle por caja — {row.cliente}
                      </p>
                      <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                        <thead className="text-slate-500 font-medium border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 text-left">Número</th>
                            <th className="py-2 px-3 text-left">Tipo</th>
                            <th className="py-2 px-3 text-left">Curva</th>
                            <th className="py-2 px-3 text-left">Temporada</th>
                            <th className="py-2 px-3 text-left">Canal</th>
                            <th className="py-2 px-3 text-left">Cliente</th>
                            <th className="py-2 px-3 text-left">Unidades</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detalleClienteExpandidoPD.map((d) => (
                            <tr key={d.numero}>
                              <td className="py-2 px-3 text-left font-medium text-slate-700">{d.numero}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.tipo}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.curva}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.temporada}</td>
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
        {filasTablaPD.length === 0 && !pdClientesLoading && (
          <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
        )}
      </div>
    </div>
  );
}

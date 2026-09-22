"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha } from "@/components/dashboard/formatters";

interface UrgenciaFila {
  contenedor: string;
  nota: string | null;
  cargadoEn: string;
  codigoCliente: string;
  cliente: string;
  canal: string;
  tipo: string;
  curva: string;
  posicion: string | null;
  conRemito: boolean;
}

export default function PDUrgencias() {
  const { activeTab, dataVersion } = useDashboard();

  const {
    data: urgenciasData,
    error: urgenciasError,
    isLoading: urgenciasLoading,
  } = useTabData<{ filas: UrgenciaFila[]; updatedAt: string | null }>(
    activeTab,
    "PD-Urgencias",
    "/api/pendiente-despacho/urgencias/resumen",
    dataVersion
  );

  const [filtroCanalUrgencias, setFiltroCanalUrgencias] = useState("TODAS");
  const [filtroTipoUrgencias, setFiltroTipoUrgencias] = useState("TODAS");
  const [filtroCurvaUrgencias, setFiltroCurvaUrgencias] = useState("TODAS");
  const [filtroClienteUrgencias, setFiltroClienteUrgencias] = useState("");
  const [clienteExpandidoUrgencias, setClienteExpandidoUrgencias] = useState<string | null>(null);

  const canalesDisponiblesUrgencias = Array.from(new Set((urgenciasData?.filas ?? []).map((f) => f.canal))).sort();
  const tiposDisponiblesUrgencias = Array.from(new Set((urgenciasData?.filas ?? []).map((f) => f.tipo))).sort();
  const curvasDisponiblesUrgencias = Array.from(new Set((urgenciasData?.filas ?? []).map((f) => f.curva))).sort();

  const { filasFiltradasUrgencias, filasTablaUrgencias, subtotalUrgencias } = useMemo(() => {
    const filasFiltradasUrgencias = (urgenciasData?.filas ?? []).filter(
      (f) =>
        (filtroCanalUrgencias === "TODAS" || f.canal === filtroCanalUrgencias) &&
        (filtroTipoUrgencias === "TODAS" || f.tipo === filtroTipoUrgencias) &&
        (filtroCurvaUrgencias === "TODAS" || f.curva === filtroCurvaUrgencias) &&
        (!filtroClienteUrgencias.trim() || f.cliente.toLowerCase().includes(filtroClienteUrgencias.trim().toLowerCase()))
    );

    const consolidadoClientesUrgencias = new Map<
      string,
      { codigoCliente: string; cliente: string; canal: string; cajas: number; conRemito: number }
    >();
    for (const f of filasFiltradasUrgencias) {
      if (!consolidadoClientesUrgencias.has(f.codigoCliente)) {
        consolidadoClientesUrgencias.set(f.codigoCliente, {
          codigoCliente: f.codigoCliente,
          cliente: f.cliente,
          canal: f.canal,
          cajas: 0,
          conRemito: 0,
        });
      }
      const acc = consolidadoClientesUrgencias.get(f.codigoCliente)!;
      acc.cajas += 1;
      if (f.conRemito) acc.conRemito += 1;
    }

    const filasTablaUrgencias = Array.from(consolidadoClientesUrgencias.values()).sort((a, b) =>
      a.canal !== b.canal ? a.canal.localeCompare(b.canal) : a.cliente.localeCompare(b.cliente)
    );

    const subtotalUrgencias = filasTablaUrgencias.reduce(
      (acc, f) => ({ cajas: acc.cajas + f.cajas, conRemito: acc.conRemito + f.conRemito }),
      { cajas: 0, conRemito: 0 }
    );

    return { filasFiltradasUrgencias, filasTablaUrgencias, subtotalUrgencias };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urgenciasData, filtroCanalUrgencias, filtroTipoUrgencias, filtroCurvaUrgencias, filtroClienteUrgencias]);

  const detalleClienteExpandidoUrgencias = useMemo(
    () =>
      clienteExpandidoUrgencias
        ? filasFiltradasUrgencias.filter((f) => f.codigoCliente === clienteExpandidoUrgencias)
        : [],
    [filasFiltradasUrgencias, clienteExpandidoUrgencias]
  );

  const handleClienteClickUrgencias = (codigoCliente: string) => {
    setClienteExpandidoUrgencias(clienteExpandidoUrgencias === codigoCliente ? null : codigoCliente);
  };

  const exportarUrgenciasExcel = async () => {
    const XLSX = await import("xlsx");
    const filasResumen = filasTablaUrgencias.map((f) => ({
      Canal: f.canal,
      Cliente: f.cliente,
      Cajas: f.cajas,
      "Con Remito": f.conRemito,
    }));
    const filasDetalle = [...filasFiltradasUrgencias]
      .sort((a, b) => a.cliente.localeCompare(b.cliente))
      .map((f) => ({
        Contenedor: f.contenedor,
        Cliente: f.cliente,
        Canal: f.canal,
        Tipo: f.tipo,
        Curva: f.curva,
        Posición: f.posicion || "SIN POSICIÓN",
        "Con Remito": f.conRemito ? "Sí" : "No",
      }));

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasResumen), "Resumen");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasDetalle), "Detalle");
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(libro, `seguimiento_urgencias_${fechaArchivo}.xlsx`);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800">Seguimiento Urgencias</h2>
        {urgenciasData && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Última actualización: <span className="font-medium text-slate-700">{fmtFecha(urgenciasData.updatedAt)}</span>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Contenedores cargados en &quot;Carga de Datos&quot;, cruzados con Pendiente de Despacho y Ocupación
        Almacén. Hacé click en un cliente para ver el detalle por contenedor.
      </p>

      {/* FILTROS */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={filtroCanalUrgencias}
          onChange={(e) => setFiltroCanalUrgencias(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODAS">Todos los canales</option>
          {canalesDisponiblesUrgencias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filtroTipoUrgencias}
          onChange={(e) => setFiltroTipoUrgencias(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODAS">Todos los tipos</option>
          {tiposDisponiblesUrgencias.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={filtroCurvaUrgencias}
          onChange={(e) => setFiltroCurvaUrgencias(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODAS">Todas las curvas</option>
          {curvasDisponiblesUrgencias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <input
          type="text"
          value={filtroClienteUrgencias}
          onChange={(e) => setFiltroClienteUrgencias(e.target.value)}
          placeholder="Buscar por cliente..."
          className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-56"
        />

        <button
          onClick={() => {
            setFiltroCanalUrgencias("TODAS");
            setFiltroTipoUrgencias("TODAS");
            setFiltroCurvaUrgencias("TODAS");
            setFiltroClienteUrgencias("");
          }}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          Limpiar filtros
        </button>

        <button
          onClick={exportarUrgenciasExcel}
          disabled={filasFiltradasUrgencias.length === 0}
          className={`ml-auto px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filasFiltradasUrgencias.length === 0
              ? "bg-slate-100 text-slate-300 cursor-not-allowed"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          Exportar a Excel
        </button>
      </div>

      {urgenciasError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar el resumen: {urgenciasError}
        </div>
      )}
      {urgenciasLoading && !urgenciasData && (
        <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
          <SkeletonTable rows={6} columns={6} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead>
            {filasTablaUrgencias.length > 0 && (
              <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                <td className="py-3 px-4 text-left" colSpan={2}>
                  Subtotal — {filasTablaUrgencias.length} cliente{filasTablaUrgencias.length === 1 ? "" : "s"}
                </td>
                <td className="py-3 px-4 text-left">{fmtNum(subtotalUrgencias.cajas)}</td>
                <td className="py-3 px-4 text-left">{fmtNum(subtotalUrgencias.conRemito)}</td>
              </tr>
            )}
            <tr className="text-slate-500 font-medium border-b border-slate-200">
              <th className="py-3 px-4 text-left">Canal</th>
              <th className="py-3 px-4 text-left">Cliente</th>
              <th className="py-3 px-4 text-left">Cajas</th>
              <th className="py-3 px-4 text-left">Con Remito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filasTablaUrgencias.map((row) => {
              const estaExpandido = clienteExpandidoUrgencias === row.codigoCliente;
              return (
                <>
                <tr
                  key={row.codigoCliente}
                  onClick={() => handleClienteClickUrgencias(row.codigoCliente)}
                  className={`cursor-pointer transition-colors ${estaExpandido ? "bg-slate-100" : "hover:bg-slate-50"}`}
                >
                  <td className="py-3 px-4 text-left font-bold text-slate-900">{row.canal}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{row.cliente}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.cajas)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(row.conRemito)}</td>
                </tr>

                {estaExpandido && (
                  <tr>
                    <td colSpan={4} className="bg-slate-50 px-4 py-4">
                      <p className="text-xs font-semibold text-slate-500 mb-2">
                        Detalle por contenedor — {row.cliente}
                      </p>
                      <table className="w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                        <thead className="text-slate-500 font-medium border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 text-left">Contenedor</th>
                            <th className="py-2 px-3 text-left">Tipo</th>
                            <th className="py-2 px-3 text-left">Curva</th>
                            <th className="py-2 px-3 text-left">Posición</th>
                            <th className="py-2 px-3 text-left">Con Remito</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detalleClienteExpandidoUrgencias.map((d) => (
                            <tr key={d.contenedor}>
                              <td className="py-2 px-3 text-left font-medium text-slate-700">{d.contenedor}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.tipo}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.curva}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{d.posicion || "—"}</td>
                              <td className="py-2 px-3 text-left">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    d.conRemito ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {d.conRemito ? "Sí" : "No"}
                                </span>
                              </td>
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
        {filasTablaUrgencias.length === 0 && !urgenciasLoading && (
          <p className="text-sm text-slate-400 text-center py-8">No hay contenedores cargados todavía.</p>
        )}
      </div>
    </div>
  );
}

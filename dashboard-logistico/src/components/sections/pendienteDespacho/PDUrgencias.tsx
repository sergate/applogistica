"use client";

import { Fragment, useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha, fmtSoloFecha } from "@/components/dashboard/formatters";

interface UrgenciaFila {
  contenedor: string;
  nota: string | null;
  bloque: string;
  fecha: string | null;
  cargadoEn: string;
  codigoCliente: string;
  cliente: string;
  canal: string;
  tipo: string;
  curva: string;
  posicion: string | null;
  conRemito: boolean;
}

interface ClienteConsolidado {
  codigoCliente: string;
  cliente: string;
  canal: string;
  cajas: number;
  conRemito: number;
}

interface BloqueResumen {
  bloque: string;
  fecha: string | null;
  filas: UrgenciaFila[];
  clientes: ClienteConsolidado[];
  cajas: number;
  conRemito: number;
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

  const [filtroBloqueUrgencias, setFiltroBloqueUrgencias] = useState("TODOS");
  const [filtroCanalUrgencias, setFiltroCanalUrgencias] = useState("TODAS");
  const [filtroTipoUrgencias, setFiltroTipoUrgencias] = useState("TODAS");
  const [filtroCurvaUrgencias, setFiltroCurvaUrgencias] = useState("TODAS");
  const [filtroClienteUrgencias, setFiltroClienteUrgencias] = useState("");
  // Cliente expandido dentro de un bloque: "bloque|codigoCliente".
  const [expandidoUrgencias, setExpandidoUrgencias] = useState<string | null>(null);

  const bloquesDisponiblesUrgencias = Array.from(new Set((urgenciasData?.filas ?? []).map((f) => f.bloque))).sort();
  const canalesDisponiblesUrgencias = Array.from(new Set((urgenciasData?.filas ?? []).map((f) => f.canal))).sort();
  const tiposDisponiblesUrgencias = Array.from(new Set((urgenciasData?.filas ?? []).map((f) => f.tipo))).sort();
  const curvasDisponiblesUrgencias = Array.from(new Set((urgenciasData?.filas ?? []).map((f) => f.curva))).sort();

  const { filasFiltradasUrgencias, bloquesUrgencias } = useMemo(() => {
    const filasFiltradasUrgencias = (urgenciasData?.filas ?? []).filter(
      (f) =>
        (filtroBloqueUrgencias === "TODOS" || f.bloque === filtroBloqueUrgencias) &&
        (filtroCanalUrgencias === "TODAS" || f.canal === filtroCanalUrgencias) &&
        (filtroTipoUrgencias === "TODAS" || f.tipo === filtroTipoUrgencias) &&
        (filtroCurvaUrgencias === "TODAS" || f.curva === filtroCurvaUrgencias) &&
        (!filtroClienteUrgencias.trim() || f.cliente.toLowerCase().includes(filtroClienteUrgencias.trim().toLowerCase()))
    );

    // Un bloque por cada nombre de bloque; dentro, una fila por cliente.
    const porBloque = new Map<string, BloqueResumen>();
    for (const f of filasFiltradasUrgencias) {
      if (!porBloque.has(f.bloque)) {
        porBloque.set(f.bloque, { bloque: f.bloque, fecha: f.fecha, filas: [], clientes: [], cajas: 0, conRemito: 0 });
      }
      const b = porBloque.get(f.bloque)!;
      b.filas.push(f);
      b.cajas += 1;
      if (f.conRemito) b.conRemito += 1;
      if (f.fecha && (!b.fecha || f.fecha < b.fecha)) b.fecha = f.fecha;
    }

    for (const b of porBloque.values()) {
      const consolidado = new Map<string, ClienteConsolidado>();
      for (const f of b.filas) {
        if (!consolidado.has(f.codigoCliente)) {
          consolidado.set(f.codigoCliente, {
            codigoCliente: f.codigoCliente,
            cliente: f.cliente,
            canal: f.canal,
            cajas: 0,
            conRemito: 0,
          });
        }
        const acc = consolidado.get(f.codigoCliente)!;
        acc.cajas += 1;
        if (f.conRemito) acc.conRemito += 1;
      }
      b.clientes = Array.from(consolidado.values()).sort((a, c) =>
        a.canal !== c.canal ? a.canal.localeCompare(c.canal) : a.cliente.localeCompare(c.cliente)
      );
    }

    const bloquesUrgencias = Array.from(porBloque.values()).sort((a, b) =>
      (b.fecha || "").localeCompare(a.fecha || "") || a.bloque.localeCompare(b.bloque)
    );

    return { filasFiltradasUrgencias, bloquesUrgencias };
  }, [urgenciasData, filtroBloqueUrgencias, filtroCanalUrgencias, filtroTipoUrgencias, filtroCurvaUrgencias, filtroClienteUrgencias]);

  const handleClienteClickUrgencias = (clave: string) => {
    setExpandidoUrgencias(expandidoUrgencias === clave ? null : clave);
  };

  const exportarUrgenciasExcel = async () => {
    const XLSX = await import("xlsx");
    const filasResumen = bloquesUrgencias.flatMap((b) =>
      b.clientes.map((f) => ({
        Bloque: b.bloque,
        Canal: f.canal,
        Cliente: f.cliente,
        Cajas: f.cajas,
        "Con Remito": f.conRemito,
      }))
    );
    const filasDetalle = [...filasFiltradasUrgencias]
      .sort((a, b) => a.bloque.localeCompare(b.bloque) || a.cliente.localeCompare(b.cliente))
      .map((f) => ({
        Bloque: f.bloque,
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
        Contenedores cargados por bloque en &quot;Carga de Datos&quot;, cruzados con Pendiente de Despacho y Ocupación
        Almacén. Hacé click en un cliente para ver el detalle por contenedor.
      </p>

      {/* FILTROS */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={filtroBloqueUrgencias}
          onChange={(e) => setFiltroBloqueUrgencias(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODOS">Todos los bloques</option>
          {bloquesDisponiblesUrgencias.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

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
            setFiltroBloqueUrgencias("TODOS");
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

      <div className="space-y-5">
        {bloquesUrgencias.map((b) => (
          <div key={b.bloque} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3.5 bg-slate-50 border-b border-slate-200">
              <div>
                <div className="font-bold text-slate-900">{b.bloque}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {b.filas.length} contenedor{b.filas.length === 1 ? "" : "es"}
                  {b.fecha ? ` · fecha ${fmtSoloFecha(b.fecha)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-5 text-sm">
                <span className="text-slate-500">
                  Cajas <span className="font-bold text-slate-800">{fmtNum(b.cajas)}</span>
                </span>
                <span className="text-slate-500">
                  Con Remito <span className="font-bold text-emerald-700">{fmtNum(b.conRemito)}</span>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                    <td className="py-3 px-4 text-left" colSpan={2}>
                      Subtotal — {b.clientes.length} cliente{b.clientes.length === 1 ? "" : "s"}
                    </td>
                    <td className="py-3 px-4 text-left">{fmtNum(b.cajas)}</td>
                    <td className="py-3 px-4 text-left">{fmtNum(b.conRemito)}</td>
                  </tr>
                  <tr className="text-slate-500 font-medium border-b border-slate-200">
                    <th className="py-3 px-4 text-left">Canal</th>
                    <th className="py-3 px-4 text-left">Cliente</th>
                    <th className="py-3 px-4 text-left">Cajas</th>
                    <th className="py-3 px-4 text-left">Con Remito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {b.clientes.map((row) => {
                    const clave = `${b.bloque}|${row.codigoCliente}`;
                    const estaExpandido = expandidoUrgencias === clave;
                    return (
                      <Fragment key={clave}>
                        <tr
                          onClick={() => handleClienteClickUrgencias(clave)}
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
                                  {b.filas
                                    .filter((f) => f.codigoCliente === row.codigoCliente)
                                    .map((d) => (
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
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {bloquesUrgencias.length === 0 && !urgenciasLoading && (
          <p className="text-sm text-slate-400 text-center py-8">No hay contenedores cargados todavía.</p>
        )}
      </div>
    </div>
  );
}

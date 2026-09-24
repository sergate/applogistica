"use client";

import { useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha } from "@/components/dashboard/formatters";

interface ProductividadFila {
  fecha: string;
  tipoProceso: string;
  grupo: string;
  cantidad: number;
  usuariosUnicos: number;
}

// Grupos de tipo de proceso para el filtro: elegir "ECOM" muestra tanto
// PICKING ECOM como FINISHING ECOM (sin sumarlos en una sola fila); ídem REPO.
const GRUPOS_PROCESO_PRODUCTIVIDAD: Record<string, string[]> = {
  "CARGA INICIAL": ["CARGA INICIAL"],
  GUARDADO: ["GUARDADO"],
  REMANENTES: ["REMANENTES"],
  ECOM: ["PICKING ECOM", "FINISHING ECOM"],
  REPO: ["PICKING REPO", "FINISHING REPO"],
};

export default function ProdResumen() {
  const { activeTab, dataVersion } = useDashboard();

  const {
    data: productividadResumen,
    error: productividadResumenError,
    isLoading: productividadResumenLoading,
  } = useTabData<{ filas: ProductividadFila[]; updatedAt: string | null }>(
    activeTab,
    "PROD-Resumen",
    "/api/productividad/resumen",
    dataVersion
  );

  // --- Filtros de la tabla de Productividad ---
  const [rangoProductividad, setRangoProductividad] = useState<7 | 14 | 30 | null>(null); // null = todos los datos
  const [fechaSeleccionadaProductividad, setFechaSeleccionadaProductividad] = useState<string>("");
  const [filtroTipoProcesoProductividad, setFiltroTipoProcesoProductividad] = useState<string>("TODOS");
  const [filtroGrupoProductividad, setFiltroGrupoProductividad] = useState<string>("TODOS");

  const gruposDisponiblesProductividad = [
    ...new Set((productividadResumen?.filas ?? []).map((f) => f.grupo)),
  ].sort();

  const hoyProductividadISO = new Date().toISOString().slice(0, 10);

  const filasProductividadFiltradas = (productividadResumen?.filas ?? []).filter((f) => {
    // Filtro de fecha: fecha puntual tiene prioridad sobre el rango de días.
    if (fechaSeleccionadaProductividad) {
      if (f.fecha !== fechaSeleccionadaProductividad) return false;
    } else if (rangoProductividad) {
      const d = new Date();
      d.setDate(d.getDate() - (rangoProductividad - 1));
      const limiteISO = d.toISOString().slice(0, 10);
      if (f.fecha < limiteISO || f.fecha > hoyProductividadISO) return false;
    }

    // Filtro de tipo de proceso (agrupado)
    if (filtroTipoProcesoProductividad !== "TODOS") {
      const permitidos = GRUPOS_PROCESO_PRODUCTIVIDAD[filtroTipoProcesoProductividad] || [];
      if (!permitidos.includes(f.tipoProceso)) return false;
    }

    // Filtro de grupo WMS (A, C, etc.)
    if (filtroGrupoProductividad !== "TODOS" && f.grupo !== filtroGrupoProductividad) return false;

    return true;
  });

  // Subtotal de "Cantidad" sobre las filas filtradas -- solo tiene sentido
  // mostrarlo cuando hay algún filtro aplicado (sin filtros, el subtotal
  // sería igual al total general).
  const hayFiltroProductividadActivo =
    rangoProductividad !== null ||
    fechaSeleccionadaProductividad !== "" ||
    filtroTipoProcesoProductividad !== "TODOS" ||
    filtroGrupoProductividad !== "TODOS";
  const subtotalCantidadProductividad = filasProductividadFiltradas.reduce((acc, f) => acc + f.cantidad, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-slate-800">Producción por Proceso</h2>
        {productividadResumen && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Última actualización de datos: <span className="font-medium text-slate-700">{fmtFecha(productividadResumen.updatedAt)}</span>
          </div>
        )}
      </div>

      {productividadResumenError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar el resumen: {productividadResumenError}
        </div>
      )}
      {productividadResumenLoading && !productividadResumen && (
        <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
          <SkeletonTable rows={6} columns={5} />
        </div>
      )}

      {/* FILTROS */}
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
                setRangoProductividad(opcion.dias);
                setFechaSeleccionadaProductividad("");
              }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !fechaSeleccionadaProductividad && rangoProductividad === opcion.dias
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
          value={fechaSeleccionadaProductividad}
          onChange={(e) => {
            setFechaSeleccionadaProductividad(e.target.value);
            setRangoProductividad(null);
          }}
          max={hoyProductividadISO}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
            fechaSeleccionadaProductividad ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
          }`}
        />

        <select
          value={filtroTipoProcesoProductividad}
          onChange={(e) => setFiltroTipoProcesoProductividad(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODOS">Todos los procesos</option>
          <option value="CARGA INICIAL">Carga Inicial</option>
          <option value="GUARDADO">Guardado</option>
          <option value="REMANENTES">Remanentes</option>
          <option value="ECOM">Ecom (Picking + Finishing)</option>
          <option value="REPO">Repo (Picking + Finishing)</option>
        </select>

        <select
          value={filtroGrupoProductividad}
          onChange={(e) => setFiltroGrupoProductividad(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="TODOS">Todos los grupos</option>
          {gruposDisponiblesProductividad.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <button
          onClick={() => {
            setRangoProductividad(null);
            setFechaSeleccionadaProductividad("");
            setFiltroTipoProcesoProductividad("TODOS");
            setFiltroGrupoProductividad("TODOS");
          }}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          Limpiar filtros
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead>
            {hayFiltroProductividadActivo && filasProductividadFiltradas.length > 0 && (
              <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold text-blue-900">
                <td className="py-3 px-4 text-left" colSpan={2}>
                  Subtotal
                </td>
                <td className="py-3 px-4 text-left">{fmtNum(subtotalCantidadProductividad)}</td>
                <td className="py-3 px-4 text-left"></td>
              </tr>
            )}
            <tr className="text-slate-500 font-medium border-b border-slate-200">
              <th className="py-4 px-4 text-left">Fecha</th>
              <th className="py-4 px-4 text-left">Tipo Proceso</th>
              <th className="py-4 px-4 text-left">Cantidad</th>
              <th className="py-4 px-4 text-left">Usuarios Únicos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filasProductividadFiltradas.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="py-4 px-4 text-left text-slate-600 font-medium">{row.fecha}</td>
                <td className="py-4 px-4 text-left font-semibold text-slate-900">{row.tipoProceso}</td>
                <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.cantidad)}</td>
                <td className="py-4 px-4 text-left text-slate-600">{fmtNum(row.usuariosUnicos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filasProductividadFiltradas.length === 0 && !productividadResumenLoading && (
          <p className="text-sm text-slate-400 text-center py-8">No hay datos que coincidan con los filtros aplicados.</p>
        )}
      </div>
    </div>
  );
}

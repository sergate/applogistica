"use client";

import { useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonCard } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtPct, fmtFecha } from "@/components/dashboard/formatters";

interface AlmacenResumenFila {
  subzona: string;
  capacidad: number;
  ocupadas: number;
  vacias: number;
  pct: number;
}
interface AlmacenResumenGrupo {
  grupo: string;
  subrows: AlmacenResumenFila[];
  subtotal: Omit<AlmacenResumenFila, "subzona">;
}

function renderAlmacenTabla(
  subrows: AlmacenResumenFila[],
  subtotal: Omit<AlmacenResumenFila, "subzona">,
  subtotalLabel: string
) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left whitespace-nowrap">
        <thead>
          <tr className="text-slate-500 font-medium border-b border-slate-200">
            <th className="py-3 px-4 text-left"></th>
            <th className="py-3 px-4 text-left">Capacidad Posiciones</th>
            <th className="py-3 px-4 text-left">Ocupación</th>
            <th className="py-3 px-4 text-left">Vacías</th>
            <th className="py-3 px-4 text-left">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {subrows.map((r) => (
            <tr key={r.subzona}>
              <td className="py-3 px-4 text-left font-medium text-slate-700">{r.subzona}</td>
              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(r.capacidad)}</td>
              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(r.ocupadas)}</td>
              <td className="py-3 px-4 text-left text-slate-600">{fmtNum(r.vacias)}</td>
              <td className="py-3 px-4 text-left">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    r.pct >= 100 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {fmtPct(r.pct)}
                </span>
              </td>
            </tr>
          ))}
          <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold text-blue-900">
            <td className="py-3 px-4 text-left">{subtotalLabel}</td>
            <td className="py-3 px-4 text-left">{fmtNum(subtotal.capacidad)}</td>
            <td className="py-3 px-4 text-left">{fmtNum(subtotal.ocupadas)}</td>
            <td className="py-3 px-4 text-left">{fmtNum(subtotal.vacias)}</td>
            <td className="py-3 px-4 text-left">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  subtotal.pct >= 100 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {fmtPct(subtotal.pct)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function AlmResumen() {
  const { activeTab, dataVersion } = useDashboard();

  const [filtroGrupoAlmacen, setFiltroGrupoAlmacen] = useState("TODOS");

  // Cache por (pestaña, dataVersion) vía SWR -- volver a esta pestaña ya
  // visitada no vuelve a pegarle a Supabase mientras el cache siga vigente.
  const {
    data: almacenResumenData,
    error: almacenResumenError,
    isLoading: almacenResumenLoading,
  } = useTabData<{
    grupos: AlmacenResumenGrupo[];
    total: Omit<AlmacenResumenFila, "subzona">;
    updatedAt: string | null;
  }>(activeTab, "ALM-Resumen", "/api/almacen/resumen", dataVersion);

  const gruposAlmacenFiltrados = (almacenResumenData?.grupos ?? []).filter(
    (g) => filtroGrupoAlmacen === "TODOS" || g.grupo === filtroGrupoAlmacen
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {["TODOS", "Pallet", "Calzado", "Indumentaria", "AWADA"].map((g) => (
            <button
              key={g}
              onClick={() => setFiltroGrupoAlmacen(g)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtroGrupoAlmacen === g ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {g === "TODOS" ? "Todos" : g}
            </button>
          ))}
        </div>
        {almacenResumenData?.updatedAt && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Última actualización: <span className="font-medium text-slate-700">{fmtFecha(almacenResumenData.updatedAt)}</span>
          </div>
        )}
      </div>

      {almacenResumenError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Error al cargar el resumen: {almacenResumenError}
        </div>
      )}
      {almacenResumenLoading && !almacenResumenData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {almacenResumenData && (
        <>
          {filtroGrupoAlmacen === "TODOS" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4">TOTAL</h2>
              {renderAlmacenTabla(
                gruposAlmacenFiltrados.map((g) => ({ subzona: g.grupo, ...g.subtotal })),
                almacenResumenData.total,
                "TOTAL"
              )}
            </div>
          )}

          {gruposAlmacenFiltrados.map((g) => (
            <div key={g.grupo} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4">{g.grupo}</h2>
              {renderAlmacenTabla(g.subrows, g.subtotal, "TOTAL")}
            </div>
          ))}

          {gruposAlmacenFiltrados.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              No hay datos de layout cargados todavía para este grupo.
            </p>
          )}
        </>
      )}
    </div>
  );
}

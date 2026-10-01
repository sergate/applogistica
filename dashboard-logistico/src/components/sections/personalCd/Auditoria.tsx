"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface Movimiento {
  id: number;
  fecha: string;
  accion: string;
  legajo: string | null;
  detalle: string;
  usuario: string;
}

const ETIQUETA_ACCION: Record<string, string> = {
  alta_dotacion: "Alta",
  cambio_estado_dotacion: "Cambio de estado",
  import_masivo_dotacion: "Import masivo",
  edicion_vacaciones_adeudadas: "Vac. Adeudadas",
  edicion_vacaciones_actuales: "Vac. Actuales",
  carga_vacaciones: "Carga de vacaciones",
};

const COLOR_ACCION: Record<string, string> = {
  alta_dotacion: "bg-green-100 text-green-700",
  cambio_estado_dotacion: "bg-amber-100 text-amber-700",
  import_masivo_dotacion: "bg-slate-100 text-slate-600",
  edicion_vacaciones_adeudadas: "bg-blue-100 text-blue-700",
  edicion_vacaciones_actuales: "bg-blue-100 text-blue-700",
  carga_vacaciones: "bg-purple-100 text-purple-700",
};

export default function Auditoria() {
  const { activeTab } = useDashboard();

  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargarAuditoria = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/auditoria");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar la auditoría.");
      setMovimientos(data.movimientos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "PCD-Auditoria" && movimientos === null) cargarAuditoria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-bold text-slate-800">Auditoría</h2>
          <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Solo Administrador</span>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Últimos movimientos en Dotación y Vacaciones: altas, cambios de estado, ediciones y cargas de días.
        </p>

        {error && <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        {cargando && movimientos === null && <p className="text-sm text-slate-400">Cargando...</p>}
        {movimientos !== null && movimientos.length === 0 && <p className="text-sm text-slate-400">Todavía no hay movimientos registrados.</p>}

        {movimientos !== null && movimientos.length > 0 && (
          <table className="w-full text-sm text-left">
            <thead className="text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="py-2 px-3">Fecha</th>
                <th className="py-2 px-3">Usuario</th>
                <th className="py-2 px-3">Legajo</th>
                <th className="py-2 px-3">Acción</th>
                <th className="py-2 px-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                    {new Date(m.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{m.usuario}</td>
                  <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{m.legajo || "—"}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${COLOR_ACCION[m.accion] || "bg-slate-100 text-slate-600"}`}>
                      {ETIQUETA_ACCION[m.accion] || m.accion}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-700">{m.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

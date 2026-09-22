"use client";

import { useEffect, useState } from "react";
import { REGISTRO_SECCIONES } from "@/lib/secciones";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtFecha } from "@/components/dashboard/formatters";

interface AccesoAdmin {
  id: string;
  subseccionKey: string;
  fechaHora: string;
  usuarioEmail: string;
  usuarioNombre: string | null;
}

// Etiqueta legible para una subseccion_key (ej: "CI-Resumen" -> "Status Carga Inicial / Resumen")
function labelSubseccion(key: string) {
  for (const seccion of REGISTRO_SECCIONES) {
    const sub = seccion.subsecciones.find((s) => s.key === key);
    if (sub) return `${seccion.nombre} / ${sub.label}`;
  }
  return key;
}

export default function AdminAccesos() {
  const { activeTab, dataVersion } = useDashboard();

  const [accesosAdmin, setAccesosAdmin] = useState<AccesoAdmin[]>([]);
  const [accesosAdminLoading, setAccesosAdminLoading] = useState(false);
  const [accesosAdminError, setAccesosAdminError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "ADMIN-Accesos") return;
    let cancelado = false;
    async function cargarAccesos() {
      setAccesosAdminLoading(true);
      setAccesosAdminError(null);
      try {
        const res = await fetch("/api/admin/accesos", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el log de accesos.");
        if (!cancelado) setAccesosAdmin(data.accesos);
      } catch (err) {
        if (!cancelado) setAccesosAdminError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        if (!cancelado) setAccesosAdminLoading(false);
      }
    }
    cargarAccesos();
    return () => {
      cancelado = true;
    };
  }, [activeTab, dataVersion]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-800 mb-4">Log de Accesos</h2>
      {accesosAdminError && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{accesosAdminError}</div>
      )}
      {accesosAdminLoading && accesosAdmin.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 text-left">Fecha y hora</th>
              <th className="py-3 px-4 text-left">Usuario</th>
              <th className="py-3 px-4 text-left">Sección / Subsección</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accesosAdmin.map((a) => (
              <tr key={a.id}>
                <td className="py-3 px-4 text-left text-slate-600">{fmtFecha(a.fechaHora)}</td>
                <td className="py-3 px-4 text-left text-slate-800 font-medium">{a.usuarioNombre || a.usuarioEmail}</td>
                <td className="py-3 px-4 text-left text-slate-600">{labelSubseccion(a.subseccionKey)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {accesosAdmin.length === 0 && !accesosAdminLoading && (
          <p className="text-sm text-slate-400 text-center py-8">Todavía no hay accesos registrados.</p>
        )}
      </div>
    </div>
  );
}

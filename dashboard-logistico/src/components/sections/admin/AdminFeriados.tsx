"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface FeriadoAdmin {
  id: string;
  fecha: string;
  descripcion: string | null;
}

export default function AdminFeriados() {
  const { activeTab, dataVersion } = useDashboard();

  const [feriadosAdmin, setFeriadosAdmin] = useState<FeriadoAdmin[]>([]);
  const [feriadosAdminLoading, setFeriadosAdminLoading] = useState(false);
  const [feriadosAdminError, setFeriadosAdminError] = useState<string | null>(null);
  const [formFeriadoFecha, setFormFeriadoFecha] = useState("");
  const [formFeriadoDescripcion, setFormFeriadoDescripcion] = useState("");
  const [creandoFeriado, setCreandoFeriado] = useState(false);

  const cargarFeriadosAdmin = async () => {
    setFeriadosAdminLoading(true);
    setFeriadosAdminError(null);
    try {
      const res = await fetch("/api/admin/feriados", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los feriados.");
      setFeriadosAdmin(data.feriados);
    } catch (err) {
      setFeriadosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setFeriadosAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "ADMIN-Feriados") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarFeriadosAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  const crearFeriado = async () => {
    if (!formFeriadoFecha) return;
    setCreandoFeriado(true);
    setFeriadosAdminError(null);
    try {
      const res = await fetch("/api/admin/feriados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: formFeriadoFecha, descripcion: formFeriadoDescripcion.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el feriado.");
      setFormFeriadoFecha("");
      setFormFeriadoDescripcion("");
      await cargarFeriadosAdmin();
    } catch (err) {
      setFeriadosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCreandoFeriado(false);
    }
  };

  const eliminarFeriado = async (id: string) => {
    if (!confirm("¿Seguro que querés eliminar este feriado?")) return;
    setFeriadosAdminError(null);
    try {
      const res = await fetch(`/api/admin/feriados/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el feriado.");
      await cargarFeriadosAdmin();
    } catch (err) {
      setFeriadosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Nuevo feriado / fecha no laboral</h2>
        {feriadosAdminError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{feriadosAdminError}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <input
            type="date"
            value={formFeriadoFecha}
            onChange={(e) => setFormFeriadoFecha(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="text"
            placeholder="Descripción (opcional, ej: Día de la Independencia)"
            value={formFeriadoDescripcion}
            onChange={(e) => setFormFeriadoDescripcion(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none sm:col-span-2"
          />
        </div>
        <button
          onClick={crearFeriado}
          disabled={!formFeriadoFecha || creandoFeriado}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            !formFeriadoFecha || creandoFeriado
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {creandoFeriado ? "Guardando..." : "Agregar feriado"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Feriados cargados</h2>
        {feriadosAdminLoading && feriadosAdmin.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 text-left">Fecha</th>
                <th className="py-3 px-4 text-left">Descripción</th>
                <th className="py-3 px-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {feriadosAdmin.map((f) => (
                <tr key={f.id}>
                  <td className="py-3 px-4 text-left text-slate-800 font-medium">
                    {new Date(`${f.fecha}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </td>
                  <td className="py-3 px-4 text-left text-slate-600">{f.descripcion || "—"}</td>
                  <td className="py-3 px-4 text-left">
                    <button onClick={() => eliminarFeriado(f.id)} className="text-sm text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {feriadosAdmin.length === 0 && !feriadosAdminLoading && (
            <p className="text-sm text-slate-400 text-center py-8">No hay feriados cargados todavía.</p>
          )}
        </div>
      </div>
    </div>
  );
}

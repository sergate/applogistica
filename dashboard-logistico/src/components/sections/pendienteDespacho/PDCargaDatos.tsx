"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtFecha } from "@/components/dashboard/formatters";

interface ContenedorUrgencia {
  id: string;
  contenedor: string;
  nota: string | null;
  created_at: string;
}

export default function PDCargaDatos() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const [contenedoresUrgencias, setContenedoresUrgencias] = useState<ContenedorUrgencia[]>([]);
  const [contenedoresUrgenciasLoading, setContenedoresUrgenciasLoading] = useState(false);
  const [contenedoresUrgenciasError, setContenedoresUrgenciasError] = useState<string | null>(null);
  const [formContenedoresTexto, setFormContenedoresTexto] = useState("");
  const [formContenedoresNota, setFormContenedoresNota] = useState("");
  const [agregandoContenedores, setAgregandoContenedores] = useState(false);
  const [vaciandoContenedores, setVaciandoContenedores] = useState(false);

  const cargarContenedoresUrgencias = async () => {
    setContenedoresUrgenciasLoading(true);
    setContenedoresUrgenciasError(null);
    try {
      const res = await fetch("/api/pendiente-despacho/urgencias/contenedores", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los contenedores.");
      setContenedoresUrgencias(data.contenedores);
    } catch (err) {
      setContenedoresUrgenciasError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setContenedoresUrgenciasLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "PD-CargaDatos") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarContenedoresUrgencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  const agregarContenedoresUrgencias = async () => {
    // Acepta contenedores separados por salto de línea, coma o espacio.
    const contenedores = Array.from(
      new Set(formContenedoresTexto.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean))
    );
    if (contenedores.length === 0) return;
    setAgregandoContenedores(true);
    setContenedoresUrgenciasError(null);
    try {
      const res = await fetch("/api/pendiente-despacho/urgencias/contenedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenedores, nota: formContenedoresNota.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron agregar los contenedores.");
      setFormContenedoresTexto("");
      setFormContenedoresNota("");
      await cargarContenedoresUrgencias();
      setDataVersion((v) => v + 1); // refresca Seguimiento Urgencias
    } catch (err) {
      setContenedoresUrgenciasError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoContenedores(false);
    }
  };

  const eliminarContenedorUrgencia = async (id: string, contenedor: string) => {
    if (!confirm(`¿Seguro que querés borrar el contenedor "${contenedor}"?`)) return;
    setContenedoresUrgenciasError(null);
    try {
      const res = await fetch(`/api/pendiente-despacho/urgencias/contenedores/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el contenedor.");
      await cargarContenedoresUrgencias();
      setDataVersion((v) => v + 1);
    } catch (err) {
      setContenedoresUrgenciasError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const vaciarContenedoresUrgencias = async () => {
    if (!confirm("¿Seguro que querés borrar TODOS los contenedores cargados? Esta acción no se puede deshacer.")) return;
    setVaciandoContenedores(true);
    setContenedoresUrgenciasError(null);
    try {
      const res = await fetch("/api/pendiente-despacho/urgencias/contenedores", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo limpiar la lista.");
      await cargarContenedoresUrgencias();
      setDataVersion((v) => v + 1);
    } catch (err) {
      setContenedoresUrgenciasError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setVaciandoContenedores(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-3xl">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Cargar contenedores urgentes</h2>
        <p className="text-sm text-slate-500 mb-4">
          Los contenedores que cargues acá se cruzan con Pendiente de Despacho y Ocupación Almacén en
          Seguimiento Urgencias. Pegá uno o varios códigos de contenedor separados por espacio, coma o salto
          de línea.
        </p>
        {contenedoresUrgenciasError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {contenedoresUrgenciasError}
          </div>
        )}
        <textarea
          value={formContenedoresTexto}
          onChange={(e) => setFormContenedoresTexto(e.target.value)}
          placeholder={"Ej: CONT001\nCONT002\nCONT003"}
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none mb-3"
        />
        <input
          type="text"
          value={formContenedoresNota}
          onChange={(e) => setFormContenedoresNota(e.target.value)}
          placeholder="Nota (opcional)"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-4"
        />
        <button
          onClick={agregarContenedoresUrgencias}
          disabled={!formContenedoresTexto.trim() || agregandoContenedores}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            !formContenedoresTexto.trim() || agregandoContenedores
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {agregandoContenedores ? "Guardando..." : "Agregar contenedores"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-800">Contenedores cargados</h2>
          <button
            onClick={vaciarContenedoresUrgencias}
            disabled={vaciandoContenedores || contenedoresUrgencias.length === 0}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              vaciandoContenedores || contenedoresUrgencias.length === 0
                ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            {vaciandoContenedores ? "Borrando..." : "Vaciar todo"}
          </button>
        </div>
        {contenedoresUrgenciasLoading && contenedoresUrgencias.length === 0 && (
          <p className="text-sm text-slate-400">Cargando...</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 text-left">Contenedor</th>
                <th className="py-3 px-4 text-left">Nota</th>
                <th className="py-3 px-4 text-left">Cargado</th>
                <th className="py-3 px-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contenedoresUrgencias.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 px-4 text-left font-semibold text-slate-800">{c.contenedor}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{c.nota || "—"}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtFecha(c.created_at)}</td>
                  <td className="py-3 px-4 text-left">
                    <button
                      onClick={() => eliminarContenedorUrgencia(c.id, c.contenedor)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {contenedoresUrgencias.length === 0 && !contenedoresUrgenciasLoading && (
            <p className="text-sm text-slate-400 text-center py-8">No hay contenedores cargados todavía.</p>
          )}
        </div>
      </div>
    </div>
  );
}

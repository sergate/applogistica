"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface SectorFila {
  id: number;
  nombre: string;
  activo: boolean;
  empleados: number;
}

export default function Sectores() {
  const { activeTab } = useDashboard();

  const [sectores, setSectores] = useState<SectorFila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");

  const cargarSectores = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/sectores");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los sectores.");
      setSectores(data.sectores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "PCD-Sectores" && sectores === null) cargarSectores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const crearSector = async () => {
    if (!nombreNuevo.trim()) return;
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/sectores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreNuevo.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el sector.");
      setNombreNuevo("");
      await cargarSectores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCreando(false);
    }
  };

  const guardarNombre = async (id: number) => {
    if (!nombreEdit.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/personal/sectores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreEdit.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo renombrar el sector.");
      setEditandoId(null);
      await cargarSectores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const toggleActivo = async (s: SectorFila) => {
    setError(null);
    try {
      const res = await fetch(`/api/personal/sectores/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !s.activo }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo actualizar el estado.");
      await cargarSectores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const eliminarSector = async (s: SectorFila) => {
    if (s.empleados > 0) return;
    if (!confirm(`¿Borrar el sector "${s.nombre}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/personal/sectores/${s.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo borrar el sector.");
      await cargarSectores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-bold text-slate-800">Sectores</h2>
          <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Solo Administrador</span>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Lista maestra que alimenta el campo &quot;Sector&quot; en Dotación. No se puede borrar un sector con empleados asignados.
        </p>

        {error && <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        <div className="flex items-center gap-3 mb-5">
          <input
            type="text"
            placeholder="Nombre del sector nuevo"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crearSector()}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-72"
          />
          <button
            onClick={crearSector}
            disabled={!nombreNuevo.trim() || creando}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              !nombreNuevo.trim() || creando ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {creando ? "Creando..." : "+ Agregar"}
          </button>
        </div>

        {cargando && sectores === null && <p className="text-sm text-slate-400">Cargando...</p>}
        {sectores !== null && sectores.length === 0 && <p className="text-sm text-slate-400">Todavía no hay sectores cargados.</p>}

        {sectores !== null && sectores.length > 0 && (
          <table className="w-full text-sm text-left">
            <thead className="text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="py-2 px-3 text-left">Sector</th>
                <th className="py-2 px-3 text-center">Empleados</th>
                <th className="py-2 px-3 text-center">Estado</th>
                <th className="py-2 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sectores.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 px-3">
                    {editandoId === s.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={nombreEdit}
                        onChange={(e) => setNombreEdit(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && guardarNombre(s.id)}
                        className="px-2 py-1 rounded border border-blue-300 text-sm w-full"
                      />
                    ) : (
                      <span className={s.activo ? "text-slate-800" : "text-slate-400"}>{s.nombre}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center text-slate-500">{s.empleados}</td>
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => toggleActivo(s)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        s.activo ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.activo ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    {editandoId === s.id ? (
                      <>
                        <button onClick={() => guardarNombre(s.id)} className="text-blue-600 hover:underline text-sm font-semibold mr-3">
                          Guardar
                        </button>
                        <button onClick={() => setEditandoId(null)} className="text-slate-400 hover:underline text-sm">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditandoId(s.id);
                            setNombreEdit(s.nombre);
                          }}
                          className="text-slate-500 hover:underline text-sm mr-3"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => eliminarSector(s)}
                          disabled={s.empleados > 0}
                          title={s.empleados > 0 ? "No se puede borrar: tiene empleados asignados" : "Eliminar sector"}
                          className={`text-sm ${s.empleados > 0 ? "text-slate-300 cursor-not-allowed" : "text-red-600 hover:underline"}`}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

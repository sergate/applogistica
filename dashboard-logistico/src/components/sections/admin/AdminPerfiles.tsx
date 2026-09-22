"use client";

import { useEffect, useState } from "react";
import { REGISTRO_SECCIONES } from "@/lib/secciones";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface PerfilAdmin {
  id: string;
  nombre: string;
  permisos: string[];
}

export default function AdminPerfiles() {
  const { activeTab, dataVersion } = useDashboard();

  const [perfilesAdmin, setPerfilesAdmin] = useState<PerfilAdmin[]>([]);
  const [perfilesAdminLoading, setPerfilesAdminLoading] = useState(false);
  const [perfilesAdminError, setPerfilesAdminError] = useState<string | null>(null);
  const [perfilSeleccionadoId, setPerfilSeleccionadoId] = useState<string | null>(null);
  const [formPerfilNombre, setFormPerfilNombre] = useState("");
  const [formPerfilPermisos, setFormPerfilPermisos] = useState<string[]>([]);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const cargarPerfilesAdmin = async () => {
    setPerfilesAdminLoading(true);
    setPerfilesAdminError(null);
    try {
      const res = await fetch("/api/admin/perfiles", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los perfiles.");
      setPerfilesAdmin(data.perfiles);
    } catch (err) {
      setPerfilesAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPerfilesAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "ADMIN-Perfiles") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPerfilesAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  const seleccionarPerfil = (perfil: PerfilAdmin | null) => {
    if (perfil) {
      setPerfilSeleccionadoId(perfil.id);
      setFormPerfilNombre(perfil.nombre);
      setFormPerfilPermisos(perfil.permisos);
    } else {
      setPerfilSeleccionadoId(null);
      setFormPerfilNombre("");
      setFormPerfilPermisos([]);
    }
  };

  const toggleFormPermiso = (key: string) => {
    setFormPerfilPermisos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const guardarPerfil = async () => {
    if (!formPerfilNombre.trim()) return;
    setGuardandoPerfil(true);
    setPerfilesAdminError(null);
    try {
      const esNuevo = !perfilSeleccionadoId;
      const res = await fetch(
        esNuevo ? "/api/admin/perfiles" : `/api/admin/perfiles/${perfilSeleccionadoId}`,
        {
          method: esNuevo ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: formPerfilNombre.trim(), permisos: formPerfilPermisos }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar el perfil.");
      await cargarPerfilesAdmin();
      seleccionarPerfil(null);
    } catch (err) {
      setPerfilesAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const eliminarPerfil = async (id: string) => {
    if (!confirm("¿Seguro que querés eliminar este perfil?")) return;
    setPerfilesAdminError(null);
    try {
      const res = await fetch(`/api/admin/perfiles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el perfil.");
      await cargarPerfilesAdmin();
      if (perfilSeleccionadoId === id) seleccionarPerfil(null);
    } catch (err) {
      setPerfilesAdminError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Perfiles</h2>
        {perfilesAdminError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{perfilesAdminError}</div>
        )}
        {perfilesAdminLoading && perfilesAdmin.length === 0 && (
          <p className="text-sm text-slate-400">Cargando...</p>
        )}
        <div className="space-y-1 mb-4">
          {perfilesAdmin.map((p) => (
            <button
              key={p.id}
              onClick={() => seleccionarPerfil(p)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                perfilSeleccionadoId === p.id ? "bg-blue-50 text-blue-700 font-semibold border border-blue-200" : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              {p.nombre}
              <span className="block text-xs text-slate-400">{p.permisos.length} subsecciones habilitadas</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => seleccionarPerfil(null)}
          className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          + Nuevo perfil
        </button>
      </div>

      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          {perfilSeleccionadoId ? "Editar perfil" : "Nuevo perfil"}
        </h2>

        <label className="block text-sm font-medium text-slate-600 mb-1">Nombre</label>
        <input
          type="text"
          value={formPerfilNombre}
          onChange={(e) => setFormPerfilNombre(e.target.value)}
          placeholder="Ej: Supervisor Logística"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm mb-6 focus:ring-2 focus:ring-blue-500 outline-none"
        />

        <p className="text-sm font-medium text-slate-600 mb-3">Secciones y subsecciones habilitadas</p>
        <div className="space-y-4 mb-6">
          {REGISTRO_SECCIONES.map((seccion) => (
            <div key={seccion.nombre}>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{seccion.nombre}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {seccion.subsecciones.map((sub) => (
                  <label key={sub.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formPerfilPermisos.includes(sub.key)}
                      onChange={() => toggleFormPermiso(sub.key)}
                      className="rounded border-slate-300"
                    />
                    {sub.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={guardarPerfil}
            disabled={!formPerfilNombre.trim() || guardandoPerfil}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              !formPerfilNombre.trim() || guardandoPerfil
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {guardandoPerfil ? "Guardando..." : perfilSeleccionadoId ? "Guardar cambios" : "Crear perfil"}
          </button>
          {perfilSeleccionadoId && (
            <button
              onClick={() => eliminarPerfil(perfilSeleccionadoId)}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Eliminar perfil
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

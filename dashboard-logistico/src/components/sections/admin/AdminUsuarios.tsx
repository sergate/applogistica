"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface PerfilAdmin {
  id: string;
  nombre: string;
  permisos: string[];
}

interface UsuarioAdmin {
  id: string;
  email: string;
  nombre: string | null;
  perfilId: string | null;
  perfilNombre: string;
}

export default function AdminUsuarios() {
  const { activeTab, dataVersion } = useDashboard();

  const [perfilesAdmin, setPerfilesAdmin] = useState<PerfilAdmin[]>([]);

  const [usuariosAdmin, setUsuariosAdmin] = useState<UsuarioAdmin[]>([]);
  const [usuariosAdminLoading, setUsuariosAdminLoading] = useState(false);
  const [usuariosAdminError, setUsuariosAdminError] = useState<string | null>(null);

  const [formUsuarioEmail, setFormUsuarioEmail] = useState("");
  const [formUsuarioPassword, setFormUsuarioPassword] = useState("");
  const [formUsuarioNombre, setFormUsuarioNombre] = useState("");
  const [formUsuarioPerfilId, setFormUsuarioPerfilId] = useState("");
  const [creandoUsuario, setCreandoUsuario] = useState(false);

  const cargarUsuariosAdmin = async () => {
    setUsuariosAdminLoading(true);
    setUsuariosAdminError(null);
    try {
      const res = await fetch("/api/admin/usuarios", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los usuarios.");
      setUsuariosAdmin(data.usuarios);
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setUsuariosAdminLoading(false);
    }
  };

  const cargarPerfilesAdmin = async () => {
    try {
      const res = await fetch("/api/admin/perfiles", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) setPerfilesAdmin(data.perfiles);
    } catch {
      // El selector de perfil simplemente queda vacío si esto falla.
    }
  };

  useEffect(() => {
    if (activeTab !== "ADMIN-Usuarios") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarUsuariosAdmin();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPerfilesAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  const crearUsuario = async () => {
    if (!formUsuarioEmail.trim() || !formUsuarioPassword) return;
    setCreandoUsuario(true);
    setUsuariosAdminError(null);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formUsuarioEmail.trim(),
          password: formUsuarioPassword,
          nombre: formUsuarioNombre.trim(),
          perfilId: formUsuarioPerfilId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el usuario.");
      setFormUsuarioEmail("");
      setFormUsuarioPassword("");
      setFormUsuarioNombre("");
      setFormUsuarioPerfilId("");
      await cargarUsuariosAdmin();
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCreandoUsuario(false);
    }
  };

  const cambiarPerfilUsuario = async (usuarioId: string, perfilId: string) => {
    setUsuariosAdminError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${usuarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfilId: perfilId || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo actualizar el usuario.");
      await cargarUsuariosAdmin();
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const eliminarUsuario = async (id: string) => {
    if (!confirm("¿Seguro que querés eliminar este usuario? Perderá el acceso a la app.")) return;
    setUsuariosAdminError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el usuario.");
      await cargarUsuariosAdmin();
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  // --- Cambiar contraseña de un usuario (edición inline por fila) ---
  const [usuarioEditandoPasswordId, setUsuarioEditandoPasswordId] = useState<string | null>(null);
  const [nuevaPasswordUsuario, setNuevaPasswordUsuario] = useState("");
  const [guardandoPasswordUsuario, setGuardandoPasswordUsuario] = useState(false);

  const guardarPasswordUsuario = async (id: string) => {
    if (nuevaPasswordUsuario.length < 6) {
      setUsuariosAdminError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setGuardandoPasswordUsuario(true);
    setUsuariosAdminError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nuevaPasswordUsuario }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cambiar la contraseña.");
      setUsuarioEditandoPasswordId(null);
      setNuevaPasswordUsuario("");
    } catch (err) {
      setUsuariosAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoPasswordUsuario(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Nuevo usuario</h2>
        {usuariosAdminError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{usuariosAdminError}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <input
            type="email"
            placeholder="Email"
            value={formUsuarioEmail}
            onChange={(e) => setFormUsuarioEmail(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={formUsuarioPassword}
            onChange={(e) => setFormUsuarioPassword(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="text"
            placeholder="Nombre (opcional)"
            value={formUsuarioNombre}
            onChange={(e) => setFormUsuarioNombre(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <select
            value={formUsuarioPerfilId}
            onChange={(e) => setFormUsuarioPerfilId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">Sin perfil</option>
            {perfilesAdmin.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
        <button
          onClick={crearUsuario}
          disabled={!formUsuarioEmail.trim() || !formUsuarioPassword || creandoUsuario}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            !formUsuarioEmail.trim() || !formUsuarioPassword || creandoUsuario
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {creandoUsuario ? "Creando..." : "Crear usuario"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Usuarios</h2>
        {usuariosAdminLoading && usuariosAdmin.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 text-left">Email</th>
                <th className="py-3 px-4 text-left">Nombre</th>
                <th className="py-3 px-4 text-left">Perfil</th>
                <th className="py-3 px-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuariosAdmin.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 px-4 text-left text-slate-800 font-medium">{u.email}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{u.nombre || "—"}</td>
                  <td className="py-3 px-4 text-left">
                    <select
                      value={u.perfilId || ""}
                      onChange={(e) => cambiarPerfilUsuario(u.id, e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Sin perfil</option>
                      {perfilesAdmin.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-left">
                    {usuarioEditandoPasswordId === u.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          placeholder="Contraseña nueva"
                          value={nuevaPasswordUsuario}
                          onChange={(e) => setNuevaPasswordUsuario(e.target.value)}
                          className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => guardarPasswordUsuario(u.id)}
                          disabled={guardandoPasswordUsuario}
                          className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => {
                            setUsuarioEditandoPasswordId(null);
                            setNuevaPasswordUsuario("");
                          }}
                          disabled={guardandoPasswordUsuario}
                          className="text-sm text-slate-400 hover:underline disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => {
                            setUsuarioEditandoPasswordId(u.id);
                            setNuevaPasswordUsuario("");
                            setUsuariosAdminError(null);
                          }}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Cambiar contraseña
                        </button>
                        <button
                          onClick={() => eliminarUsuario(u.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usuariosAdmin.length === 0 && !usuariosAdminLoading && (
            <p className="text-sm text-slate-400 text-center py-8">No hay usuarios cargados todavía.</p>
          )}
        </div>
      </div>
    </div>
  );
}

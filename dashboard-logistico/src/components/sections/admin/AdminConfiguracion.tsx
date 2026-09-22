"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

export default function AdminConfiguracion() {
  const { activeTab, dataVersion } = useDashboard();

  const [configAdmin, setConfigAdmin] = useState<{ notification_email: string | null } | null>(null);
  const [configAdminLoading, setConfigAdminLoading] = useState(false);
  const [configAdminError, setConfigAdminError] = useState<string | null>(null);
  const [configAdminExito, setConfigAdminExito] = useState(false);
  const [formNotificationEmail, setFormNotificationEmail] = useState("");
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  const cargarConfigAdmin = async () => {
    setConfigAdminLoading(true);
    setConfigAdminError(null);
    try {
      const res = await fetch("/api/admin/config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar la configuración.");
      setConfigAdmin(data.config);
      setFormNotificationEmail(data.config?.notification_email || "");
    } catch (err) {
      setConfigAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setConfigAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "ADMIN-Configuracion") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarConfigAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  const guardarConfigAdmin = async () => {
    if (!formNotificationEmail.trim()) return;
    setGuardandoConfig(true);
    setConfigAdminError(null);
    setConfigAdminExito(false);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationEmail: formNotificationEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar la configuración.");
      setConfigAdmin(data.config);
      setConfigAdminExito(true);
    } catch (err) {
      setConfigAdminError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoConfig(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-lg">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Configuración</h2>
      <p className="text-sm text-slate-500 mb-6">
        Dirección de mail a la que se avisa cuando alguien crea una cuenta nueva desde el login
        (esa cuenta queda sin perfil asignado hasta que un administrador se lo asigne).
      </p>

      {configAdminError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{configAdminError}</div>
      )}
      {configAdminExito && !configAdminError && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          Configuración guardada.
        </div>
      )}
      {configAdminLoading && !configAdmin && <p className="text-sm text-slate-400 mb-4">Cargando...</p>}

      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1">Email de notificaciones</label>
        <input
          type="email"
          value={formNotificationEmail}
          onChange={(e) => {
            setFormNotificationEmail(e.target.value);
            setConfigAdminExito(false);
          }}
          placeholder="admin@tuempresa.com"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      <button
        onClick={guardarConfigAdmin}
        disabled={!formNotificationEmail.trim() || guardandoConfig}
        className={`mt-4 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          !formNotificationEmail.trim() || guardandoConfig
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {guardandoConfig ? "Guardando..." : "Guardar"}
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtFecha } from "@/components/dashboard/formatters";

interface DespachoGrupoMiembro {
  codigoCliente: string;
  nombre: string | null;
}
interface DespachoGrupo {
  id: number;
  nombre: string;
  miembros: DespachoGrupoMiembro[];
}
interface DespachoEvento {
  id: number;
  trabajo_id: number | null;
  despacho_cab_id: number;
  guia: string | null;
  tipo: string;
  paso: string;
  resultado: string;
  mensaje: string | null;
  usuario_nombre: string | null;
  ocurrido_en: string;
}

export default function DESPGrupos() {
  const { activeTab, setDataVersion } = useDashboard();

  const [despachoGrupos, setDespachoGrupos] = useState<DespachoGrupo[] | null>(null);
  const [despachoGruposError, setDespachoGruposError] = useState<string | null>(null);
  const [despachoGruposCargando, setDespachoGruposCargando] = useState(false);
  const [nombreNuevoGrupo, setNombreNuevoGrupo] = useState("");
  const [creandoGrupo, setCreandoGrupo] = useState(false);
  const [grupoExpandido, setGrupoExpandido] = useState<number | null>(null);
  const [codigoNuevoMiembro, setCodigoNuevoMiembro] = useState("");
  const [agregandoMiembro, setAgregandoMiembro] = useState(false);

  const [despachoOcultarTipoCliente, setDespachoOcultarTipoCliente] = useState<boolean | null>(null);
  const [despachoConfigError, setDespachoConfigError] = useState<string | null>(null);
  const [despachoConfigGuardando, setDespachoConfigGuardando] = useState(false);

  const cargarDespachoConfig = async () => {
    try {
      const res = await fetch("/api/admin/despacho-configuracion");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar la configuración.");
      setDespachoOcultarTipoCliente(data.ocultarTipoCliente);
    } catch (err) {
      setDespachoConfigError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const cambiarDespachoOcultarTipoCliente = async (valor: boolean) => {
    setDespachoConfigGuardando(true);
    setDespachoConfigError(null);
    try {
      const res = await fetch("/api/admin/despacho-configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocultarTipoCliente: valor }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar.");
      setDespachoOcultarTipoCliente(data.ocultarTipoCliente);
      setDataVersion((v) => v + 1);
    } catch (err) {
      setDespachoConfigError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDespachoConfigGuardando(false);
    }
  };

  const [despachoEventos, setDespachoEventos] = useState<DespachoEvento[] | null>(null);
  const [despachoEventosError, setDespachoEventosError] = useState<string | null>(null);
  const [despachoEventosCargando, setDespachoEventosCargando] = useState(false);
  const [despachoEventosSoloErrores, setDespachoEventosSoloErrores] = useState(true);

  const cargarDespachoEventos = async () => {
    setDespachoEventosCargando(true);
    setDespachoEventosError(null);
    try {
      const res = await fetch(`/api/admin/despacho-eventos?limit=200${despachoEventosSoloErrores ? "&soloErrores=1" : ""}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar el log.");
      setDespachoEventos(data.eventos);
    } catch (err) {
      setDespachoEventosError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDespachoEventosCargando(false);
    }
  };

  const cargarDespachoGrupos = async () => {
    setDespachoGruposCargando(true);
    setDespachoGruposError(null);
    try {
      const res = await fetch("/api/admin/despacho-grupos");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los grupos.");
      setDespachoGrupos(data.grupos);
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDespachoGruposCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "DESP-Grupos" && despachoGrupos === null) cargarDespachoGrupos();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "DESP-Grupos" && despachoOcultarTipoCliente === null) cargarDespachoConfig();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "DESP-Grupos" && despachoEventos === null) cargarDespachoEventos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "DESP-Grupos" && despachoEventos !== null) cargarDespachoEventos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [despachoEventosSoloErrores]);

  const crearDespachoGrupo = async () => {
    if (!nombreNuevoGrupo.trim()) return;
    setCreandoGrupo(true);
    setDespachoGruposError(null);
    try {
      const res = await fetch("/api/admin/despacho-grupos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreNuevoGrupo.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el grupo.");
      setNombreNuevoGrupo("");
      await cargarDespachoGrupos();
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCreandoGrupo(false);
    }
  };

  const borrarDespachoGrupo = async (id: number) => {
    if (!confirm("¿Borrar este grupo? Los clientes quedan sin grupo.")) return;
    try {
      const res = await fetch(`/api/admin/despacho-grupos/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo borrar el grupo.");
      await cargarDespachoGrupos();
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const agregarMiembroGrupo = async (grupoId: number) => {
    if (!codigoNuevoMiembro.trim()) return;
    setAgregandoMiembro(true);
    setDespachoGruposError(null);
    try {
      const res = await fetch(`/api/admin/despacho-grupos/${grupoId}/miembros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoCliente: codigoNuevoMiembro.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo agregar el cliente.");
      setCodigoNuevoMiembro("");
      await cargarDespachoGrupos();
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoMiembro(false);
    }
  };

  const quitarMiembroGrupo = async (grupoId: number, codigoCliente: string) => {
    try {
      const res = await fetch(`/api/admin/despacho-grupos/${grupoId}/miembros/${encodeURIComponent(codigoCliente)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo quitar el cliente.");
      await cargarDespachoGrupos();
    } catch (err) {
      setDespachoGruposError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Configuración general</h2>
        <p className="text-sm text-slate-500 mb-4">
          Estos ajustes afectan lo que ve cualquier usuario en Despacho → Para Imprimir / Guías Impresas.
        </p>
        {despachoConfigError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{despachoConfigError}</div>
        )}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={despachoOcultarTipoCliente ?? false}
            disabled={despachoOcultarTipoCliente === null || despachoConfigGuardando}
            onChange={(e) => cambiarDespachoOcultarTipoCliente(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-slate-700">
            Ocultar guías de tipo CLIENTE en Para Imprimir / Guías Impresas
          </span>
          {despachoConfigGuardando && <span className="text-xs text-slate-400">Guardando...</span>}
        </label>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Grupos de clientes</h2>
        <p className="text-sm text-slate-500 mb-4">
          Los grupos aparecen como columna y filtro en Despacho → Para Imprimir / Guías Impresas. Un
          cliente puede pertenecer a varios grupos a la vez (ej. entrega martes Y jueves).
        </p>
        {despachoGruposError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{despachoGruposError}</div>
        )}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Nombre del grupo nuevo"
            value={nombreNuevoGrupo}
            onChange={(e) => setNombreNuevoGrupo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crearDespachoGrupo()}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-72"
          />
          <button
            onClick={crearDespachoGrupo}
            disabled={!nombreNuevoGrupo.trim() || creandoGrupo}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              !nombreNuevoGrupo.trim() || creandoGrupo
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {creandoGrupo ? "Creando..." : "Crear grupo"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Grupos existentes</h2>
        {despachoGruposCargando && despachoGrupos === null && <p className="text-sm text-slate-400">Cargando...</p>}
        {despachoGrupos !== null && despachoGrupos.length === 0 && (
          <p className="text-sm text-slate-400">Todavía no creaste ningún grupo.</p>
        )}
        <div className="space-y-3">
          {(despachoGrupos || []).map((g) => {
            const expandido = grupoExpandido === g.id;
            return (
              <div key={g.id} className="border border-slate-200 rounded-lg">
                <button
                  onClick={() => setGrupoExpandido(expandido ? null : g.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-800">{g.nombre}</span>
                    <span className="text-xs text-slate-400">
                      {g.miembros.length} cliente{g.miembros.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        borrarDespachoGrupo(g.id);
                      }}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Borrar
                    </span>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandido ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </button>
                {expandido && (
                  <div className="border-t border-slate-200 p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <input
                        type="text"
                        placeholder="Número de cliente"
                        value={codigoNuevoMiembro}
                        onChange={(e) => setCodigoNuevoMiembro(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && agregarMiembroGrupo(g.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-48"
                      />
                      <button
                        onClick={() => agregarMiembroGrupo(g.id)}
                        disabled={!codigoNuevoMiembro.trim() || agregandoMiembro}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          !codigoNuevoMiembro.trim() || agregandoMiembro
                            ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        Agregar cliente
                      </button>
                    </div>
                    {g.miembros.length === 0 ? (
                      <p className="text-sm text-slate-400">Sin clientes en este grupo todavía.</p>
                    ) : (
                      <table className="w-full text-sm text-left">
                        <thead className="text-slate-500 font-medium border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 text-left">Número</th>
                            <th className="py-2 px-3 text-left">Cliente</th>
                            <th className="py-2 px-3 text-left">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {g.miembros.map((m) => (
                            <tr key={m.codigoCliente}>
                              <td className="py-2 px-3 text-left font-medium text-slate-700">{m.codigoCliente}</td>
                              <td className="py-2 px-3 text-left text-slate-600">{m.nombre || "—"}</td>
                              <td className="py-2 px-3 text-left">
                                <button
                                  onClick={() => quitarMiembroGrupo(g.id, m.codigoCliente)}
                                  className="text-sm text-red-600 hover:underline"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-800">Log de eventos de impresión</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={despachoEventosSoloErrores}
                onChange={(e) => setDespachoEventosSoloErrores(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              Solo errores
            </label>
            <button
              onClick={cargarDespachoEventos}
              disabled={despachoEventosCargando}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {despachoEventosCargando ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Cada intento de imprimir la guía o el remito de un despacho (éxito o error), con quién y cuándo lo
          pidió. Solo visible para admins -- útil para ver el motivo puntual de una falla sin depender de la
          consola del Agente Local, que corre sin ventana visible.
        </p>
        {despachoEventosError && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{despachoEventosError}</div>
        )}
        {despachoEventosCargando && despachoEventos === null && <p className="text-sm text-slate-400">Cargando...</p>}
        {despachoEventos !== null && despachoEventos.length === 0 && (
          <p className="text-sm text-slate-400">
            {despachoEventosSoloErrores ? "Sin errores registrados." : "Sin eventos registrados todavía."}
          </p>
        )}
        {despachoEventos !== null && despachoEventos.length > 0 && (
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="sticky top-0 bg-white">
                <tr className="text-slate-500 font-medium border-b border-slate-200">
                  <th className="py-2 px-3 text-left">Fecha</th>
                  <th className="py-2 px-3 text-left">Guía</th>
                  <th className="py-2 px-3 text-left">Tipo</th>
                  <th className="py-2 px-3 text-left">Paso</th>
                  <th className="py-2 px-3 text-left">Resultado</th>
                  <th className="py-2 px-3 text-left">Usuario</th>
                  <th className="py-2 px-3 text-left">Mensaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {despachoEventos.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2 px-3 text-left text-slate-500">{fmtFecha(ev.ocurrido_en)}</td>
                    <td className="py-2 px-3 text-left font-medium text-slate-700">{ev.guia || "—"}</td>
                    <td className="py-2 px-3 text-left text-slate-600">{ev.tipo}</td>
                    <td className="py-2 px-3 text-left text-slate-600">{ev.paso}</td>
                    <td className="py-2 px-3 text-left">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          ev.resultado === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {ev.resultado === "ok" ? "OK" : "Error"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-left text-slate-600">{ev.usuario_nombre || "—"}</td>
                    <td className="py-2 px-3 text-left text-slate-500 whitespace-pre-wrap max-w-md">{ev.mensaje || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

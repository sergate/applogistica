"use client";

import { Fragment, useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha } from "@/components/dashboard/formatters";

interface GuiaDisponible {
  despachoCabId: number;
  guia: string;
  clienteCodigo: string;
  cliente: string;
  contenedores: number;
  posiciones: string[];
}

interface PlanFila {
  id: number;
  codigo: string;
  clienteNombre: string;
  estado: "pendiente" | "en_curso" | "completo" | "cancelado";
  creadoEn: string;
  cerradoEn: string | null;
  guias: { despachoCabId: number; guia: string; contenedores: number }[];
  posiciones: { posicion: string; orden: number; ok: boolean; guia: string }[];
}

interface PlanesData {
  planes: PlanFila[];
  guiasDisponibles: GuiaDisponible[];
}

const ESTILO_ESTADO: Record<PlanFila["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-amber-100 text-amber-700" },
  en_curso: { texto: "En curso", clase: "bg-blue-100 text-blue-700" },
  completo: { texto: "Completo", clase: "bg-emerald-100 text-emerald-700" },
  cancelado: { texto: "Cancelado", clase: "bg-slate-100 text-slate-500" },
};

export default function PHPlanes() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const { data, error, isLoading } = useTabData<PlanesData>(activeTab, "PH-Planes", "/api/pack-hold/planes", dataVersion);

  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [expandido, setExpandido] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const disponibles = useMemo(() => data?.guiasDisponibles ?? [], [data]);
  const planes = useMemo(() => data?.planes ?? [], [data]);

  // Un plan es de un solo cliente: al tildar una guía, las de otros clientes quedan bloqueadas.
  const clienteElegido = useMemo(() => {
    const primera = disponibles.find((g) => seleccion.has(g.despachoCabId));
    return primera ? primera.clienteCodigo : null;
  }, [disponibles, seleccion]);

  const resumenSeleccion = useMemo(() => {
    const elegidas = disponibles.filter((g) => seleccion.has(g.despachoCabId));
    return {
      guias: elegidas.length,
      posiciones: elegidas.reduce((acc, g) => acc + g.posiciones.length, 0),
      bultos: elegidas.reduce((acc, g) => acc + g.contenedores, 0),
    };
  }, [disponibles, seleccion]);

  const alternar = (id: number) => {
    setSeleccion((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const llamar = async (url: string, cuerpo?: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || "No se pudo completar la acción.");
    return json;
  };

  const generar = async () => {
    setTrabajando(true);
    setAviso(null);
    try {
      const json = await llamar("/api/pack-hold/planes", { despachoCabIds: [...seleccion] });
      setAviso({
        ok: true,
        texto: `Plan ${json.codigo} generado: ${json.guias} guía(s), ${json.posiciones} posición(es) a recoger.`,
      });
      setSeleccion(new Set());
      setDataVersion((v) => v + 1);
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setTrabajando(false);
    }
  };

  const cancelar = async (p: PlanFila) => {
    if (!window.confirm(`¿Cancelar el plan ${p.codigo}? Las guías quedan libres y sus posiciones siguen ocupadas.`)) return;
    setTrabajando(true);
    setAviso(null);
    try {
      await llamar(`/api/pack-hold/planes/${p.id}/cancelar`);
      setAviso({ ok: true, texto: `Plan ${p.codigo} cancelado.` });
      setDataVersion((v) => v + 1);
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="space-y-6">
      {aviso && (
        <div
          className={`p-3 rounded-lg text-sm border ${
            aviso.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {aviso.texto}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">Error al cargar: {error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Nuevo plan de recogida</h2>
        <p className="text-sm text-slate-500 mb-4">
          Elegí una o más guías ubicadas <strong>de un mismo cliente</strong>: así los pallets no se mezclan en el piso. El
          código del plan se genera solo (PH-cliente).
        </p>

        {isLoading && !data && (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <SkeletonTable rows={4} columns={5} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 w-10"></th>
                <th className="py-3 px-4 text-left">Cliente</th>
                <th className="py-3 px-4 text-left">Guía</th>
                <th className="py-3 px-4 text-right">Bultos</th>
                <th className="py-3 px-4 text-left">Posiciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {disponibles.map((g) => {
                const bloqueada = clienteElegido !== null && clienteElegido !== g.clienteCodigo;
                return (
                  <tr key={g.despachoCabId} className={bloqueada ? "opacity-40" : "hover:bg-slate-50"}>
                    <td className="py-2 px-4">
                      <input
                        type="checkbox"
                        checked={seleccion.has(g.despachoCabId)}
                        disabled={bloqueada || trabajando}
                        onChange={() => alternar(g.despachoCabId)}
                        aria-label={`Elegir la guía ${g.guia}`}
                      />
                    </td>
                    <td className="py-2 px-4 text-left font-medium text-slate-800">{g.cliente}</td>
                    <td className="py-2 px-4 text-left text-slate-700">{g.guia}</td>
                    <td className="py-2 px-4 text-right text-slate-700">{fmtNum(g.contenedores)}</td>
                    <td className="py-2 px-4 text-left text-slate-600">{g.posiciones.join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {disponibles.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">
              No hay guías ubicadas disponibles para un plan nuevo.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={generar}
            disabled={seleccion.size === 0 || trabajando}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {trabajando ? "Generando..." : "Generar plan de recogida"}
          </button>
          <span className="text-sm text-slate-500">
            {resumenSeleccion.guias > 0
              ? `${resumenSeleccion.guias} guía(s) · ${fmtNum(resumenSeleccion.posiciones)} posición(es) · ${fmtNum(resumenSeleccion.bultos)} bultos`
              : "Ninguna guía elegida"}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Planes</h2>
        <p className="text-sm text-slate-500 mb-4">
          Los planes activos y los últimos 30 cerrados. Un plan se cierra solo cuando el operario cumple todas sus
          posiciones en el handheld.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Plan</th>
                <th className="py-3 px-4 text-left">Cliente</th>
                <th className="py-3 px-4 text-left">Estado</th>
                <th className="py-3 px-4 text-right">Guías</th>
                <th className="py-3 px-4 text-right">Avance</th>
                <th className="py-3 px-4 text-left">Creado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {planes.map((p) => {
                const recogidas = p.posiciones.filter((x) => x.ok).length;
                const activo = p.estado === "pendiente" || p.estado === "en_curso";
                const estilo = ESTILO_ESTADO[p.estado];
                return (
                  <Fragment key={p.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-4 text-left font-bold text-slate-900">{p.codigo}</td>
                      <td className="py-2 px-4 text-left text-slate-700">{p.clienteNombre}</td>
                      <td className="py-2 px-4 text-left">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${estilo.clase}`}>{estilo.texto}</span>
                      </td>
                      <td className="py-2 px-4 text-right text-slate-700">{p.guias.length}</td>
                      <td className="py-2 px-4 text-right text-slate-700">
                        {recogidas} / {p.posiciones.length}
                      </td>
                      <td className="py-2 px-4 text-left text-slate-600">{fmtFecha(p.creadoEn)}</td>
                      <td className="py-2 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                          className="text-blue-600 hover:underline text-sm font-medium mr-4"
                        >
                          {expandido === p.id ? "Ocultar" : "Ver"}
                        </button>
                        {activo && (
                          <button
                            type="button"
                            onClick={() => cancelar(p)}
                            disabled={trabajando}
                            className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandido === p.id && (
                      <tr>
                        <td colSpan={7} className="px-4 pb-4 bg-slate-50">
                          <p className="text-xs text-slate-500 pt-3 mb-2">
                            Guías: {p.guias.map((g) => `${g.guia} (${fmtNum(g.contenedores)} bultos)`).join(", ")}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {p.posiciones.map((x) => (
                              <span
                                key={x.posicion}
                                title={x.guia}
                                className={`px-2 py-1 rounded-md text-xs font-mono font-semibold border ${
                                  x.ok
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : "bg-white border-slate-200 text-slate-700"
                                }`}
                              >
                                {x.orden}. {x.posicion}
                                {x.ok ? " ✓" : ""}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {planes.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">Todavía no hay planes de recogida.</p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface IndicadorAlmacen {
  grupo: string;
  subzona: string;
  habilitado: boolean;
}

export default function AlmConfiguracion() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const [indicadoresAlmacen, setIndicadoresAlmacen] = useState<IndicadorAlmacen[]>([]);
  const [indicadoresAlmacenLoading, setIndicadoresAlmacenLoading] = useState(false);
  const [indicadoresAlmacenError, setIndicadoresAlmacenError] = useState<string | null>(null);
  const [guardandoIndicadoresAlmacen, setGuardandoIndicadoresAlmacen] = useState(false);
  const [guardadoIndicadoresAlmacenOk, setGuardadoIndicadoresAlmacenOk] = useState(false);

  const cargarIndicadoresAlmacen = async () => {
    setIndicadoresAlmacenLoading(true);
    setIndicadoresAlmacenError(null);
    try {
      const res = await fetch("/api/almacen/indicadores", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los indicadores.");
      setIndicadoresAlmacen(data.items);
    } catch (err) {
      setIndicadoresAlmacenError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIndicadoresAlmacenLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "ALM-Configuracion") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarIndicadoresAlmacen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  const toggleIndicadorAlmacen = (grupo: string, subzona: string) => {
    setIndicadoresAlmacen((prev) =>
      prev.map((it) => (it.grupo === grupo && it.subzona === subzona ? { ...it, habilitado: !it.habilitado } : it))
    );
    setGuardadoIndicadoresAlmacenOk(false);
  };

  const toggleGrupoAlmacen = (grupo: string, habilitado: boolean) => {
    setIndicadoresAlmacen((prev) => prev.map((it) => (it.grupo === grupo ? { ...it, habilitado } : it)));
    setGuardadoIndicadoresAlmacenOk(false);
  };

  const guardarIndicadoresAlmacen = async () => {
    setGuardandoIndicadoresAlmacen(true);
    setIndicadoresAlmacenError(null);
    setGuardadoIndicadoresAlmacenOk(false);
    try {
      const res = await fetch("/api/almacen/indicadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: indicadoresAlmacen }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar la configuración.");
      setGuardadoIndicadoresAlmacenOk(true);
      setDataVersion((v) => v + 1); // refresca Resumen con los indicadores nuevos
    } catch (err) {
      setIndicadoresAlmacenError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoIndicadoresAlmacen(false);
    }
  };

  const indicadoresPorGrupoAlmacen = new Map<string, IndicadorAlmacen[]>();
  for (const it of indicadoresAlmacen) {
    if (!indicadoresPorGrupoAlmacen.has(it.grupo)) indicadoresPorGrupoAlmacen.set(it.grupo, []);
    indicadoresPorGrupoAlmacen.get(it.grupo)!.push(it);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Indicadores a mostrar</h2>
      <p className="text-sm text-slate-500 mb-6">
        Elegí qué grupos y sub-filas se muestran en Ocupación Almacén - Resumen. Los que apagues acá dejan de
        verse (y de sumarse en los totales) para todos los usuarios.
      </p>

      {indicadoresAlmacenError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {indicadoresAlmacenError}
        </div>
      )}
      {indicadoresAlmacenLoading && indicadoresAlmacen.length === 0 && (
        <p className="text-sm text-slate-400">Cargando...</p>
      )}

      <div className="space-y-5">
        {Array.from(indicadoresPorGrupoAlmacen.entries()).map(([grupo, items]) => {
          const todosHabilitados = items.every((it) => it.habilitado);
          const ningunoHabilitado = items.every((it) => !it.habilitado);
          return (
            <div key={grupo} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800">{grupo}</h3>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    onClick={() => toggleGrupoAlmacen(grupo, true)}
                    disabled={todosHabilitados}
                    className="font-medium text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
                  >
                    Habilitar todo
                  </button>
                  <button
                    onClick={() => toggleGrupoAlmacen(grupo, false)}
                    disabled={ningunoHabilitado}
                    className="font-medium text-slate-500 hover:underline disabled:text-slate-300 disabled:no-underline"
                  >
                    Deshabilitar todo
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {items.map((it) => (
                  <label
                    key={it.subzona}
                    className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={it.habilitado}
                      onChange={() => toggleIndicadorAlmacen(grupo, it.subzona)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {it.subzona}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={guardarIndicadoresAlmacen}
          disabled={guardandoIndicadoresAlmacen || indicadoresAlmacen.length === 0}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            guardandoIndicadoresAlmacen || indicadoresAlmacen.length === 0
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {guardandoIndicadoresAlmacen ? "Guardando..." : "Guardar"}
        </button>
        {guardadoIndicadoresAlmacenOk && (
          <span className="text-sm text-emerald-600 font-medium">Guardado correctamente.</span>
        )}
      </div>
    </div>
  );
}

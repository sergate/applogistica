"use client";

import { useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum } from "@/components/dashboard/formatters";

interface ZonaFila {
  zona: string;
  posiciones: number;
  ocupadas: number;
  habilitada: boolean;
}

// Pantalla del admin: qué zonas del layout del almacén se pueden usar en Pack
// and Hold. Hoy solo RACK NAVE 2; el admin suma más desde acá sin tocar código.
export default function PHZonas() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const { data, error, isLoading } = useTabData<{ zonas: ZonaFila[] }>(
    activeTab,
    "PH-Zonas",
    "/api/pack-hold/zonas",
    dataVersion
  );

  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const cambiar = async (z: ZonaFila) => {
    setGuardando(z.zona);
    setAviso(null);
    try {
      const res = await fetch("/api/pack-hold/zonas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zona: z.zona, habilitada: !z.habilitada }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo guardar el cambio.");
      setAviso({
        ok: true,
        texto: !z.habilitada
          ? `${z.zona} habilitada: ya se pueden registrar guías en sus posiciones.`
          : z.ocupadas > 0
            ? `${z.zona} deshabilitada. Sus ${z.ocupadas} posiciones ocupadas siguen vigentes hasta que se liberen, pero ya no se podrán registrar guías nuevas ahí.`
            : `${z.zona} deshabilitada.`,
      });
      setDataVersion((v) => v + 1);
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setGuardando(null);
    }
  };

  const zonas = data?.zonas ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-4xl">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Zonas habilitadas para Pack and Hold</h2>
        <p className="text-sm text-slate-500 mb-5">
          Las zonas salen del layout del almacén (Ocupación Almacén → Importar Layout). Solo se pueden registrar guías
          en posiciones de las zonas habilitadas. Cambiar una zona no mueve ni libera nada: las posiciones ya
          ocupadas siguen vigentes hasta que se liberen.
        </p>

        {aviso && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm border ${
              aviso.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {aviso.texto}
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            Error al cargar: {error}
          </div>
        )}
        {isLoading && !data && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
            <SkeletonTable rows={5} columns={4} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Zona</th>
                <th className="py-3 px-4 text-left">Posiciones en el layout</th>
                <th className="py-3 px-4 text-left">Ocupadas</th>
                <th className="py-3 px-4 text-left">Habilitada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {zonas.map((z) => (
                <tr key={z.zona}>
                  <td className="py-3 px-4 text-left font-bold text-slate-900">{z.zona}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(z.posiciones)}</td>
                  <td className="py-3 px-4 text-left text-slate-600">{fmtNum(z.ocupadas)}</td>
                  <td className="py-3 px-4 text-left">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={z.habilitada}
                      aria-label={`Habilitar ${z.zona}`}
                      disabled={guardando === z.zona}
                      onClick={() => cambiar(z)}
                      className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
                        z.habilitada ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                          z.habilitada ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {zonas.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">
              No hay zonas: importá primero el layout del almacén en Ocupación Almacén.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

// Panel para generar el token personal del Agente Local. El token se
// muestra una sola vez (igual que un secreto de API) -- si se pierde, hay
// que generar uno nuevo (el anterior queda invalidado).
export default function AgenteTokenPanel() {
  const [tieneToken, setTieneToken] = useState<boolean | null>(null);
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    fetch("/api/actualizaciones/token")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setTieneToken(data.tieneToken);
      })
      .catch(() => {});
  }, []);

  const generarToken = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/actualizaciones/token", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo generar el token.");
      setTokenNuevo(data.token);
      setTieneToken(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 mb-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-sm font-semibold text-slate-700 flex items-center gap-2"
      >
        <span>Agente Local (actualización automática desde tu PC)</span>
        <span className="text-slate-400">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="mt-3 text-sm text-slate-600 space-y-3">
          <p>
            El botón &quot;Actualizar esta sección (WMS)&quot; necesita que tengas instalado y corriendo el
            Agente Local en tu PC, configurado con un token personal.
          </p>

          {tieneToken && !tokenNuevo && (
            <p className="text-emerald-700 text-xs font-medium">
              Ya tenés un token generado. Si no lo tenés guardado, generá uno nuevo (el anterior deja de
              funcionar).
            </p>
          )}

          <button
            type="button"
            onClick={generarToken}
            disabled={cargando}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {cargando ? "Generando..." : tieneToken ? "Generar nuevo token" : "Generar mi token"}
          </button>

          {tokenNuevo && (
            <div className="p-3 rounded-lg bg-white border border-emerald-200">
              <p className="text-xs text-slate-500 mb-1">
                Copiá este token en la configuración del Agente Local en tu PC. No se vuelve a mostrar.
              </p>
              <code className="block text-xs font-mono bg-slate-100 p-2 rounded break-all select-all">
                {tokenNuevo}
              </code>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

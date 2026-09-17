"use client";

import { useRef, useState } from "react";
import ScanInput, { type ScanInputHandle } from "@/components/ScanInput";

interface BultoEsperado {
  codigo: string;
  tipo: "despacho" | "interlocal";
  referencia: string;
}

interface BultoEstado extends BultoEsperado {
  escaneado: boolean;
}

// El API devuelve cada bulto esperado ya con su estado "escaneado" resuelto
// (en true si la sesión se está retomando y ese código ya tenía un evento
// ok_nuevo antes) -- no se recalcula en el cliente.
type BultoEsperadoConEstado = BultoEsperado & { escaneado: boolean };

interface HojaInfo {
  id: number;
  fecha: string;
  local_codigo: string;
  local_nombre: string | null;
}

type Fase = "escanear_hoja" | "escaneando" | "resultado";

// Página pensada para un handheld/lector de código de barras: el lector
// emula un teclado (tipea el código + Enter), así que el flujo entero pasa
// por un único input siempre enfocado, sin necesidad de tocar la pantalla
// para cada escaneo.
export default function EscanerHojaDeRutaPage() {
  const [fase, setFase] = useState<Fase>("escanear_hoja");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [hoja, setHoja] = useState<HojaInfo | null>(null);
  const [escaneoId, setEscaneoId] = useState<number | null>(null);
  const [bultos, setBultos] = useState<BultoEstado[]>([]);
  const [mostrarConfirmarFaltante, setMostrarConfirmarFaltante] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<{
    esperados: number;
    escaneados: number;
    completo: boolean;
    faltantes: BultoEsperado[];
  } | null>(null);

  const scanInputRef = useRef<ScanInputHandle>(null);

  const reiniciar = () => {
    setFase("escanear_hoja");
    setError(null);
    setAviso(null);
    setHoja(null);
    setEscaneoId(null);
    setBultos([]);
    setMostrarConfirmarFaltante(false);
    setResultadoFinal(null);
  };

  const escanearHoja = async (codigo: string) => {
    const m = codigo.trim().match(/^HDR-(\d+)$/i);
    if (!m) {
      setError(`Ese código no es de una Hoja de Ruta: "${codigo}"`);
      return;
    }
    const hojaId = m[1];
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/hoja-ruta/${hojaId}/escaneo/iniciar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo iniciar el escaneo.");
      setHoja(data.hoja);
      setEscaneoId(data.escaneoId);
      setBultos(data.bultosEsperados as BultoEsperadoConEstado[]);
      setAviso(
        data.retomada
          ? `Retomando escaneo anterior: ya tenías ${(data.bultosEsperados as BultoEsperadoConEstado[]).filter((b) => b.escaneado).length} bultos escaneados.`
          : null
      );
      setFase("escaneando");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  const registrarEvento = (codigo: string, tipo: "despacho" | "interlocal" | null, resultado: string) => {
    if (!hoja || !escaneoId) return;
    fetch(`/api/hoja-ruta/${hoja.id}/escaneo/${escaneoId}/evento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, tipo, resultado }),
    }).catch(() => {
      // Si falla el registro del evento no bloqueamos el escaneo en curso --
      // el conteo local sigue siendo la fuente de verdad para la sesión.
    });
  };

  const escanearBulto = (codigo: string) => {
    const idx = bultos.findIndex((b) => b.codigo === codigo.trim());
    if (idx === -1) {
      setAviso(`Código no pertenece a esta hoja: "${codigo}"`);
      registrarEvento(codigo.trim(), null, "no_pertenece");
      return;
    }
    if (bultos[idx].escaneado) {
      setAviso(`Ya escaneado: ${codigo}`);
      registrarEvento(codigo.trim(), bultos[idx].tipo, "ok_duplicado");
      return;
    }
    setAviso(null);
    setBultos((prev) => prev.map((b, i) => (i === idx ? { ...b, escaneado: true } : b)));
    registrarEvento(codigo.trim(), bultos[idx].tipo, "ok_nuevo");
  };

  const onScan = (codigo: string) => {
    if (!codigo) return;
    if (fase === "escanear_hoja") escanearHoja(codigo);
    else if (fase === "escaneando") escanearBulto(codigo);
  };

  const escaneados = bultos.filter((b) => b.escaneado).length;
  const faltantes = bultos.filter((b) => !b.escaneado);

  const cerrarSesion = async (faltantesACerrar: BultoEsperado[]) => {
    if (!hoja || !escaneoId) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/hoja-ruta/${hoja.id}/escaneo/${escaneoId}/finalizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bultosEscaneados: escaneados,
          faltantes: faltantesACerrar.map((f) => ({ codigo: f.codigo, tipo: f.tipo })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cerrar el escaneo.");
      setResultadoFinal({
        esperados: bultos.length,
        escaneados,
        completo: faltantesACerrar.length === 0,
        faltantes: faltantesACerrar,
      });
      setFase("resultado");
      setMostrarConfirmarFaltante(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  const onFinalizarEscaneo = () => {
    if (faltantes.length === 0) {
      cerrarSesion([]);
    } else {
      setMostrarConfirmarFaltante(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
        <h1 className="text-lg font-bold text-slate-800 mb-4 text-center">Control de bultos — Hoja de Ruta</h1>

        {fase === "escanear_hoja" && (
          <>
            <p className="text-sm text-slate-500 mb-4 text-center">Escaneá el código de la Hoja de Ruta.</p>
            <div className="w-full px-4 py-4 text-lg text-center rounded-lg bg-slate-100 text-slate-400">
              Esperando escaneo...
            </div>
            <ScanInput ref={scanInputRef} onScan={onScan} disabled={cargando} />
            {cargando && <p className="text-sm text-slate-400 mt-3 text-center">Buscando hoja...</p>}
            {error && <p className="text-sm text-red-600 mt-3 text-center">{error}</p>}
          </>
        )}

        {fase === "escaneando" && hoja && (
          <>
            <div className="text-center mb-4">
              <p className="text-sm text-slate-500">
                Hoja #{hoja.id} — {hoja.local_codigo} {hoja.local_nombre || ""}
              </p>
              <p className="text-3xl font-bold text-slate-800 mt-1">
                {escaneados} / {bultos.length}
              </p>
              <p className="text-xs text-slate-400">bultos escaneados</p>
            </div>

            <div className="mb-3 w-full px-4 py-4 text-lg text-center rounded-lg bg-slate-100 text-slate-400">
              Escaneá un bulto...
            </div>
            <ScanInput ref={scanInputRef} onScan={onScan} disabled={cargando || mostrarConfirmarFaltante} />

            {aviso && (
              <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 text-center">
                {aviso}
              </div>
            )}
            {error && (
              <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 text-center">
                {error}
              </div>
            )}

            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 mb-4">
              {bultos.map((b) => (
                <div key={b.codigo} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className={b.escaneado ? "text-slate-700" : "text-slate-400"}>{b.codigo}</p>
                    <p className="text-xs text-slate-400">{b.referencia}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      b.escaneado ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {b.escaneado ? "OK" : "Pendiente"}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={onFinalizarEscaneo}
              disabled={cargando}
              className="w-full py-3 rounded-lg text-base font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Finalizar escaneo
            </button>

            {mostrarConfirmarFaltante && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-xl p-6 max-w-sm w-full">
                  <h2 className="text-base font-bold text-slate-800 mb-2">Faltan bultos por escanear</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    Escaneaste {escaneados} de {bultos.length}. Faltan {faltantes.length}:
                  </p>
                  <ul className="text-sm text-slate-600 mb-4 max-h-32 overflow-y-auto list-disc pl-5">
                    {faltantes.map((f) => (
                      <li key={f.codigo}>
                        {f.codigo} ({f.referencia})
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setMostrarConfirmarFaltante(false)}
                      className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Seguir escaneando
                    </button>
                    <button
                      onClick={() => cerrarSesion(faltantes)}
                      disabled={cargando}
                      className="w-full py-2.5 rounded-lg text-sm font-semibold bg-red-50 text-red-700 border border-red-300 hover:bg-red-100 disabled:opacity-50"
                    >
                      Cerrar con faltante
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {fase === "resultado" && resultadoFinal && (
          <div className="text-center">
            {resultadoFinal.completo ? (
              <>
                <p className="text-emerald-600 text-2xl font-bold mb-2">Cerrado correctamente</p>
                <p className="text-sm text-slate-600 mb-6">
                  {resultadoFinal.escaneados} de {resultadoFinal.esperados} bultos escaneados.
                </p>
              </>
            ) : (
              <>
                <p className="text-amber-600 text-2xl font-bold mb-2">Cerrado con faltante</p>
                <p className="text-sm text-slate-600 mb-3">
                  {resultadoFinal.escaneados} de {resultadoFinal.esperados} bultos escaneados.
                </p>
                <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Bultos faltantes:</p>
                  <ul className="text-sm text-amber-800 list-disc pl-5">
                    {resultadoFinal.faltantes.map((f) => (
                      <li key={f.codigo}>
                        {f.codigo} ({f.referencia})
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            <button
              onClick={reiniciar}
              className="w-full py-3 rounded-lg text-base font-semibold bg-slate-800 text-white hover:bg-slate-900"
            >
              Nueva sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

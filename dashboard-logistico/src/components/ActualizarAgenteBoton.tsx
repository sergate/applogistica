"use client";

import { useEffect, useRef, useState } from "react";

type Seccion = "no_ecom" | "ecom" | "carga_inicial" | "remanentes";

interface PedidoEstado {
  id: number;
  estado: "pendiente" | "corriendo" | "ok" | "error";
  mensaje: string | null;
  progreso: number | null;
  paso: string | null;
  created_at: string;
}

const SEGUNDOS_ANTES_DE_AVISAR_SIN_AGENTE = 30;
const INTERVALO_POLLING_MS = 3000;

// Botón "Actualizar esta sección": crea un pedido en actualizaciones_wms y
// hace polling de su estado hasta que el Agente Local (corriendo en la PC
// del usuario) lo toma y lo resuelve. Ver src/lib/actualizacionesWms.ts y
// las rutas /api/actualizaciones/* para el resto del circuito.
export default function ActualizarAgenteBoton({
  seccion,
  onExito,
}: {
  seccion: Seccion;
  onExito?: () => void;
}) {
  const [pedido, setPedido] = useState<PedidoEstado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoSinAgente, setAvisoSinAgente] = useState(false);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inicioEsperaRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, []);

  const detenerPolling = () => {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  };

  const consultarEstado = async () => {
    try {
      const res = await fetch(`/api/actualizaciones/estado?seccion=${seccion}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error consultando el estado.");

      const p: PedidoEstado | null = data.pedido;
      setPedido(p);

      if (!p) return;

      if (p.estado === "pendiente") {
        const segundosEsperando = (Date.now() - inicioEsperaRef.current) / 1000;
        setAvisoSinAgente(segundosEsperando > SEGUNDOS_ANTES_DE_AVISAR_SIN_AGENTE);
      } else {
        setAvisoSinAgente(false);
      }

      if (p.estado === "ok" || p.estado === "error") {
        detenerPolling();
        if (p.estado === "ok") onExito?.();
      }
    } catch (err) {
      detenerPolling();
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const solicitarActualizacion = async () => {
    setEnviando(true);
    setError(null);
    setAvisoSinAgente(false);
    try {
      const res = await fetch("/api/actualizaciones/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seccion }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el pedido.");

      inicioEsperaRef.current = Date.now();
      setPedido({
        id: data.id,
        estado: data.estado,
        mensaje: null,
        progreso: 0,
        paso: null,
        created_at: new Date().toISOString(),
      });

      detenerPolling();
      intervaloRef.current = setInterval(consultarEstado, INTERVALO_POLLING_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  };

  const corriendo = pedido?.estado === "pendiente" || pedido?.estado === "corriendo";

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={solicitarActualizacion}
        disabled={enviando || corriendo}
        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
          enviando || corriendo
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
      >
        {corriendo
          ? pedido?.estado === "corriendo"
            ? "Actualizando..."
            : "Esperando al Agente Local..."
          : "Actualizar esta sección (WMS)"}
      </button>

      {pedido?.estado === "corriendo" && (
        <div className="mt-2 max-w-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{pedido.paso || "Procesando..."}</span>
            <span className="font-semibold text-slate-700">{pedido.progreso ?? 0}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${pedido.progreso ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {pedido?.estado === "pendiente" && (
        <p className="text-xs text-slate-500 mt-2">Esperando que tu Agente Local tome el pedido...</p>
      )}

      {avisoSinAgente && (
        <p className="text-xs text-amber-600 mt-1">
          No detectamos que tu Agente Local esté corriendo. Verificá que esté abierto en tu PC (o configuralo
          si todavía no lo instalaste).
        </p>
      )}

      {pedido?.estado === "ok" && (
        <p className="text-xs text-emerald-600 font-medium mt-2">Actualizado correctamente.</p>
      )}

      {pedido?.estado === "error" && (
        <p className="text-xs text-red-600 mt-2">Error: {pedido.mensaje || "Falló la actualización."}</p>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

interface CameraScanInputProps {
  onScan: (code: string) => void;
  disabled?: boolean;
}

// Escaneo por cámara para celulares Android sin lector físico -- usa
// BarcodeDetector, la API nativa de Chrome/Android (motor ML Kit de
// Google), que decodifica en vivo sobre el video sin depender de una
// librería JS pesada. No existe en Safari/iOS -- esta página es
// específicamente para Android (ver /hoja-ruta/escaner para el handheld
// con lector físico, que usa un mecanismo totalmente distinto).
export default function CameraScanInput({ onScan, disabled }: CameraScanInputProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const ultimoCodigoRef = useRef<{ codigo: string; ts: number } | null>(null);
  // Siempre la versión más nueva de onScan sin que el efecto de la cámara
  // tenga que reiniciarse en cada render del padre (evita reabrir la cámara
  // por cada re-render, que sería lento y parpadeante).
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const [error, setError] = useState<string | null>(null);
  const [linternaDisponible, setLinternaDisponible] = useState(false);
  const [linternaActiva, setLinternaActiva] = useState(false);

  useEffect(() => {
    if (disabled) return;
    if (!("BarcodeDetector" in window)) {
      setError("Este navegador no soporta escaneo por cámara -- usá Chrome en Android.");
      return;
    }

    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    const detector = new BarcodeDetectorCtor({ formats: ["code_128"] });

    async function loop() {
      if (cancelado || !videoRef.current) return;
      try {
        const codigos = await detector.detect(videoRef.current);
        if (codigos.length > 0) {
          const codigo = (codigos[0].rawValue || "").trim();
          const ahora = Date.now();
          const ultimo = ultimoCodigoRef.current;
          // Mismo código detectado en cuadros seguidos mientras el usuario
          // todavía lo tiene encuadrado -- no dispararlo de nuevo hasta que
          // pase un rato (evita registrar el mismo bulto 10 veces seguidas).
          if (codigo && !(ultimo && ultimo.codigo === codigo && ahora - ultimo.ts < 1500)) {
            ultimoCodigoRef.current = { codigo, ts: ahora };
            if (navigator.vibrate) navigator.vibrate(80);
            onScanRef.current(codigo);
          }
        }
      } catch {
        // Cuadro sin código o error puntual de decode -- seguimos el loop.
      }
      if (!cancelado) rafRef.current = requestAnimationFrame(loop);
    }

    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capabilities = (stream.getVideoTracks()[0].getCapabilities?.() || {}) as any;
        setLinternaDisponible(!!capabilities.torch);
        loop();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo acceder a la cámara.");
      }
    }

    iniciar();

    return () => {
      cancelado = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [disabled]);

  const toggleLinterna = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track.applyConstraints({ advanced: [{ torch: !linternaActiva }] } as any);
      setLinternaActiva((v) => !v);
    } catch {
      // Algunos dispositivos reportan soporte de torch pero fallan igual --
      // no rompemos el escaneo por esto.
    }
  };

  if (error) {
    return <p className="text-sm text-red-600 text-center p-4">{error}</p>;
  }

  return (
    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-black">
      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      <div className="absolute inset-8 border-2 border-white/70 rounded-lg pointer-events-none" />
      {linternaDisponible && (
        <button
          type="button"
          onClick={toggleLinterna}
          className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center text-lg"
          aria-label="Linterna"
        >
          {linternaActiva ? "🔦" : "💡"}
        </button>
      )}
    </div>
  );
}

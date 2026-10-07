"use client";

import { useCallback, useRef, useState } from "react";
import ScanInput, { type ScanInputHandle } from "@/components/ScanInput";

interface PlanLista {
  id: number;
  codigo: string;
  clienteNombre: string;
  estado: string;
  guias: number;
  posiciones: number;
  recogidas: number;
}

interface PlanDetalle {
  id: number;
  codigo: string;
  clienteNombre: string;
  guias: { despachoCabId: number; guia: string }[];
  posiciones: { posicion: string; orden: number; ok: boolean; guia: string }[];
}

type Pantalla = "menu" | "ubicar" | "planes" | "despacho";

type Mensaje = { tipo: "ok" | "error"; texto: string } | null;

const fetchJson = async (url: string, cuerpo?: unknown) => {
  const res = await fetch(url, {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
  return { ok: res.ok && json.success !== false, json };
};

const normalizar = (v: string) => v.replace(/\s+/g, "").toUpperCase();

// Pantalla para el handheld (tipo Honeywell CX65, Chrome, ~360x640 vertical):
// letras y botones grandes, y todo se escanea con el lector, que tipea el código
// + Enter en un input invisible siempre enfocado. Pack and Hold nunca escribe en
// el WMS: acá solo se ubican guías en posiciones y se recogen según un plan.
export default function PackHoldHandheldPage() {
  const [pantalla, setPantalla] = useState<Pantalla>("menu");
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [cargando, setCargando] = useState(false);
  const scanRef = useRef<ScanInputHandle>(null);

  // Ubicar: primero el contenedor, después la posición.
  const [contenedor, setContenedor] = useState<string | null>(null);

  // Despacho
  const [planes, setPlanes] = useState<PlanLista[]>([]);
  const [planElegido, setPlanElegido] = useState<string>("");
  const [plan, setPlan] = useState<PlanDetalle | null>(null);
  const [posicionEscaneada, setPosicionEscaneada] = useState<string | null>(null);
  const [planCompleto, setPlanCompleto] = useState<string | null>(null);

  const irAMenu = () => {
    setPantalla("menu");
    setMensaje(null);
    setContenedor(null);
    setPlan(null);
    setPosicionEscaneada(null);
    setPlanCompleto(null);
  };

  const vibrar = (patron: number | number[]) => {
    try {
      navigator.vibrate?.(patron);
    } catch {
      // no todos los navegadores lo soportan
    }
  };

  // ---------------- Ubicar ----------------
  const escanearUbicar = async (codigo: string) => {
    if (!contenedor) {
      setContenedor(normalizar(codigo));
      setMensaje(null);
      return;
    }
    setCargando(true);
    try {
      const { ok, json } = await fetchJson("/api/pack-hold/ubicar", { contenedor, posicion: normalizar(codigo) });
      if (!ok) {
        vibrar([200, 100, 200]);
        setMensaje({ tipo: "error", texto: json.error || "No se pudo registrar." });
      } else {
        vibrar(80);
        const extra = json.posiciones > 1 ? ` (${json.posiciones} posiciones)` : "";
        setMensaje({
          tipo: "ok",
          texto:
            json.estado === "ya_registrada"
              ? `Ya estaba registrada: ${json.posicion} · ${json.guia}`
              : `Guardada en ${json.posicion}\nGuía ${json.guia}${extra}\n${json.cliente ?? ""}`,
        });
      }
      setContenedor(null);
    } catch (err) {
      setMensaje({ tipo: "error", texto: err instanceof Error ? err.message : "Error inesperado." });
      setContenedor(null);
    } finally {
      setCargando(false);
    }
  };

  // ---------------- Despacho ----------------
  const cargarPlanes = useCallback(async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const { ok, json } = await fetchJson("/api/pack-hold/handheld/planes");
      if (!ok) throw new Error(json.error || "No se pudieron cargar los planes.");
      setPlanes(json.planes as PlanLista[]);
      setPlanElegido("");
    } catch (err) {
      setMensaje({ tipo: "error", texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setCargando(false);
    }
  }, []);

  const abrirPantallaPlanes = async () => {
    setPantalla("planes");
    await cargarPlanes();
  };

  const cargarPlan = async (id: number) => {
    const { ok, json } = await fetchJson(`/api/pack-hold/handheld/planes/${id}`);
    if (!ok) throw new Error(json.error || "No se pudo cargar el plan.");
    setPlan(json.plan as PlanDetalle);
  };

  const abrirPlan = async () => {
    if (!planElegido) return;
    setCargando(true);
    setMensaje(null);
    try {
      await cargarPlan(Number(planElegido));
      setPosicionEscaneada(null);
      setPantalla("despacho");
    } catch (err) {
      setMensaje({ tipo: "error", texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setCargando(false);
    }
  };

  const escanearDespacho = async (codigo: string) => {
    if (!plan) return;
    const valor = normalizar(codigo);

    // Paso 1: la posición.
    if (!posicionEscaneada) {
      const fila = plan.posiciones.find((p) => p.posicion === valor);
      if (!fila) {
        vibrar([200, 100, 200]);
        setMensaje({ tipo: "error", texto: `${valor} no es una posición de este plan.` });
        return;
      }
      if (fila.ok) {
        vibrar([200, 100, 200]);
        setMensaje({ tipo: "error", texto: `${valor} ya se recogió.` });
        return;
      }
      setPosicionEscaneada(valor);
      setMensaje(null);
      return;
    }

    // Paso 2: un contenedor cualquiera de la guía que está en esa posición.
    setCargando(true);
    try {
      const { ok, json } = await fetchJson(`/api/pack-hold/handheld/planes/${plan.id}/recoger`, {
        posicion: posicionEscaneada,
        contenedor: valor,
      });
      if (!ok) {
        vibrar([200, 100, 200]);
        setMensaje({ tipo: "error", texto: json.error || "No se pudo registrar." });
        setPosicionEscaneada(null);
        return;
      }
      vibrar(80);
      setPosicionEscaneada(null);
      if (json.planCompleto) {
        setPlanCompleto(plan.codigo);
        setPlan(null);
        setMensaje(null);
        return;
      }
      setMensaje({ tipo: "ok", texto: `${json.posicion} OK · faltan ${json.pendientes}` });
      await cargarPlan(plan.id);
    } catch (err) {
      setMensaje({ tipo: "error", texto: err instanceof Error ? err.message : "Error inesperado." });
      setPosicionEscaneada(null);
    } finally {
      setCargando(false);
    }
  };

  const onScan = (codigo: string) => {
    if (cargando) return;
    if (pantalla === "ubicar") void escanearUbicar(codigo);
    else if (pantalla === "despacho" && plan) void escanearDespacho(codigo);
  };

  const escaneando = pantalla === "ubicar" || (pantalla === "despacho" && !!plan);

  const siguiente = plan?.posiciones.find((p) => !p.ok) ?? null;
  const recogidas = plan ? plan.posiciones.filter((p) => p.ok).length : 0;

  const bloqueMensaje = mensaje && (
    <div
      className={`mt-4 p-4 rounded-xl text-xl font-bold whitespace-pre-line text-center ${
        mensaje.tipo === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {mensaje.texto}
    </div>
  );

  const botonVolver = (
    <button
      type="button"
      onClick={irAMenu}
      className="w-full py-4 rounded-xl bg-slate-200 text-slate-700 text-xl font-bold"
    >
      Volver al menú
    </button>
  );

  return (
    <main className="min-h-screen bg-slate-50 p-4 max-w-md mx-auto">
      {escaneando && <ScanInput ref={scanRef} onScan={onScan} disabled={cargando} />}

      <h1 className="text-2xl font-extrabold text-slate-900 mb-4 text-center">Pack and Hold</h1>

      {pantalla === "menu" && (
        <div className="space-y-4 mt-8">
          <button
            type="button"
            onClick={() => {
              setPantalla("ubicar");
              setMensaje(null);
              setContenedor(null);
            }}
            className="w-full py-8 rounded-2xl bg-blue-600 text-white text-3xl font-extrabold"
          >
            Ubicar
          </button>
          <button
            type="button"
            onClick={abrirPantallaPlanes}
            className="w-full py-8 rounded-2xl bg-emerald-600 text-white text-3xl font-extrabold"
          >
            Despacho
          </button>
        </div>
      )}

      {pantalla === "ubicar" && (
        <div>
          <div className="p-4 rounded-xl bg-white border-2 border-blue-300 text-center">
            <p className="text-lg text-slate-500">{contenedor ? "Paso 2 de 2" : "Paso 1 de 2"}</p>
            <p className="text-2xl font-extrabold text-blue-700 mt-1">
              {contenedor ? "Escaneá la POSICIÓN" : "Escaneá un CONTENEDOR"}
            </p>
            {contenedor && <p className="text-lg font-mono text-slate-700 mt-2 break-all">{contenedor}</p>}
          </div>
          {cargando && <p className="mt-4 text-center text-xl text-slate-500">Guardando...</p>}
          {bloqueMensaje}
          {contenedor && (
            <button
              type="button"
              onClick={() => {
                setContenedor(null);
                setMensaje(null);
              }}
              className="w-full mt-4 py-4 rounded-xl bg-amber-100 text-amber-800 text-xl font-bold"
            >
              Cambiar contenedor
            </button>
          )}
          <div className="mt-4">{botonVolver}</div>
        </div>
      )}

      {pantalla === "planes" && (
        <div>
          <p className="text-xl font-bold text-slate-700 mb-2">Plan de recogida</p>
          <select
            value={planElegido}
            onChange={(e) => setPlanElegido(e.target.value)}
            className="w-full p-4 text-xl rounded-xl border-2 border-slate-300 bg-white"
          >
            <option value="">{cargando ? "Cargando..." : planes.length ? "Elegí un plan" : "No hay planes pendientes"}</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} · {p.recogidas}/{p.posiciones}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={abrirPlan}
            disabled={!planElegido || cargando}
            className="w-full mt-4 py-5 rounded-xl bg-emerald-600 text-white text-2xl font-extrabold disabled:opacity-40"
          >
            Empezar
          </button>
          <button
            type="button"
            onClick={cargarPlanes}
            disabled={cargando}
            className="w-full mt-3 py-4 rounded-xl bg-white border-2 border-slate-300 text-slate-700 text-xl font-bold"
          >
            Actualizar lista
          </button>
          {bloqueMensaje}
          <div className="mt-4">{botonVolver}</div>
        </div>
      )}

      {pantalla === "despacho" && planCompleto && (
        <div className="text-center mt-6">
          <div className="p-8 rounded-2xl bg-green-100 border-2 border-green-400">
            <p className="text-5xl">✓</p>
            <p className="text-3xl font-extrabold text-green-800 mt-2">PLAN OK</p>
            <p className="text-2xl font-bold text-green-800 mt-1">{planCompleto}</p>
            <p className="text-lg text-green-700 mt-2">Todas las posiciones recogidas. El plan se cerró.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPlanCompleto(null);
              void abrirPantallaPlanes();
            }}
            className="w-full mt-6 py-5 rounded-xl bg-emerald-600 text-white text-2xl font-extrabold"
          >
            Otro plan
          </button>
          <div className="mt-3">{botonVolver}</div>
        </div>
      )}

      {pantalla === "despacho" && plan && (
        <div>
          <div className="p-3 rounded-xl bg-white border border-slate-200 text-center">
            <p className="text-2xl font-extrabold text-slate-900">{plan.codigo}</p>
            <p className="text-lg text-slate-600">
              {recogidas} de {plan.posiciones.length} posiciones
            </p>
          </div>

          <div className="mt-3 p-4 rounded-xl bg-white border-2 border-emerald-300 text-center">
            {posicionEscaneada ? (
              <>
                <p className="text-lg text-slate-500">Posición {posicionEscaneada}</p>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">Escaneá un CONTENEDOR de esa guía</p>
              </>
            ) : (
              <>
                <p className="text-lg text-slate-500">Siguiente sugerida</p>
                <p className="text-3xl font-extrabold font-mono text-emerald-700 mt-1">{siguiente?.posicion ?? "—"}</p>
                <p className="text-lg text-slate-600 mt-1">Escaneá la POSICIÓN</p>
              </>
            )}
          </div>

          {cargando && <p className="mt-3 text-center text-xl text-slate-500">Guardando...</p>}
          {bloqueMensaje}

          <ul className="mt-4 space-y-2">
            {plan.posiciones.map((p) => (
              <li
                key={p.posicion}
                className={`flex items-center justify-between px-4 py-3 rounded-lg text-lg font-mono font-bold border ${
                  p.ok
                    ? "bg-green-50 border-green-200 text-green-700"
                    : siguiente?.posicion === p.posicion
                      ? "bg-white border-emerald-400 text-slate-900"
                      : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                <span>
                  {p.orden}. {p.posicion}
                </span>
                <span>{p.ok ? "✓" : ""}</span>
              </li>
            ))}
          </ul>

          {posicionEscaneada && (
            <button
              type="button"
              onClick={() => {
                setPosicionEscaneada(null);
                setMensaje(null);
              }}
              className="w-full mt-4 py-4 rounded-xl bg-amber-100 text-amber-800 text-xl font-bold"
            >
              Cambiar posición
            </button>
          )}
          <div className="mt-4">{botonVolver}</div>
        </div>
      )}
    </main>
  );
}

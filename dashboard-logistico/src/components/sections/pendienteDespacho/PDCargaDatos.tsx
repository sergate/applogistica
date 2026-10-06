"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtSoloFecha } from "@/components/dashboard/formatters";

interface ContenedorUrgencia {
  id: string;
  contenedor: string;
  nota: string | null;
  bloque: string;
  fecha: string | null;
  created_at: string;
}

interface BloqueContenedores {
  bloque: string;
  fecha: string | null;
  contenedores: ContenedorUrgencia[];
}

export default function PDCargaDatos() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const [contenedoresUrgencias, setContenedoresUrgencias] = useState<ContenedorUrgencia[]>([]);
  const [contenedoresUrgenciasLoading, setContenedoresUrgenciasLoading] = useState(false);
  const [contenedoresUrgenciasError, setContenedoresUrgenciasError] = useState<string | null>(null);
  const [formContenedoresTexto, setFormContenedoresTexto] = useState("");
  const [formBloque, setFormBloque] = useState("");
  const [formFecha, setFormFecha] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [agregandoContenedores, setAgregandoContenedores] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [bloqueAbierto, setBloqueAbierto] = useState<string | null>(null);
  const [bloquePorEliminar, setBloquePorEliminar] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cargarContenedoresUrgencias = async () => {
    setContenedoresUrgenciasLoading(true);
    setContenedoresUrgenciasError(null);
    try {
      const res = await fetch("/api/pendiente-despacho/urgencias/contenedores", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los contenedores.");
      setContenedoresUrgencias(data.contenedores);
    } catch (err) {
      setContenedoresUrgenciasError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setContenedoresUrgenciasLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "PD-CargaDatos") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarContenedoresUrgencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dataVersion]);

  // Bloques ordenados por fecha de carga (los más nuevos primero).
  const bloques = useMemo<BloqueContenedores[]>(() => {
    const porBloque = new Map<string, BloqueContenedores>();
    for (const c of contenedoresUrgencias) {
      if (!porBloque.has(c.bloque)) porBloque.set(c.bloque, { bloque: c.bloque, fecha: c.fecha, contenedores: [] });
      const b = porBloque.get(c.bloque)!;
      b.contenedores.push(c);
      if (c.fecha && (!b.fecha || c.fecha < b.fecha)) b.fecha = c.fecha;
    }
    return Array.from(porBloque.values()).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  }, [contenedoresUrgencias]);

  // Acepta contenedores separados por salto de línea, coma o espacio.
  const contenedoresDelForm = Array.from(
    new Set(formContenedoresTexto.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean))
  );
  const formValido = contenedoresDelForm.length > 0 && formBloque.trim() !== "" && !!formFecha;

  const agregarContenedoresUrgencias = async () => {
    if (!formValido) return;
    setAgregandoContenedores(true);
    setContenedoresUrgenciasError(null);
    setMensaje(null);
    try {
      const res = await fetch("/api/pendiente-despacho/urgencias/contenedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenedores: contenedoresDelForm, bloque: formBloque, fecha: formFecha }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron agregar los contenedores.");

      const enOtro: { contenedor: string; bloque: string }[] = data.enOtroBloque || [];
      setMensaje(
        `Se agregaron ${data.agregados} contenedor${data.agregados === 1 ? "" : "es"} al bloque «${data.bloque}».` +
          (data.yaCargados > 0 ? ` ${data.yaCargados} ya estaba${data.yaCargados === 1 ? "" : "n"} cargado${data.yaCargados === 1 ? "" : "s"}.` : "") +
          (enOtro.length > 0
            ? ` Ojo: ${enOtro.length} está${enOtro.length === 1 ? "" : "n"} en otro bloque y no se mueve${enOtro.length === 1 ? "" : "n"} (${enOtro
                .slice(0, 5)
                .map((c) => `${c.contenedor} → ${c.bloque}`)
                .join(", ")}${enOtro.length > 5 ? ", ..." : ""}).`
            : "")
      );
      setFormContenedoresTexto("");
      setFormBloque("");
      setBloqueAbierto(data.bloque);
      await cargarContenedoresUrgencias();
      setDataVersion((v) => v + 1); // refresca Seguimiento Urgencias
    } catch (err) {
      setContenedoresUrgenciasError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoContenedores(false);
    }
  };

  // "Agregar contenedores" de un bloque ya cargado: precarga su nombre y su
  // fecha en el formulario y deja el cursor listo para pegar los nuevos.
  const prepararAgregar = (b: BloqueContenedores) => {
    setFormBloque(b.bloque);
    if (b.fecha) setFormFecha(String(b.fecha).slice(0, 10));
    setFormContenedoresTexto("");
    setMensaje(null);
    setContenedoresUrgenciasError(null);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.scrollIntoView({ behavior: "smooth", block: "center" });
      textarea.focus({ preventScroll: true });
    }
  };

  const eliminarBloque = async (bloque: string) => {
    setContenedoresUrgenciasError(null);
    setMensaje(null);
    try {
      const res = await fetch("/api/pendiente-despacho/urgencias/contenedores", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bloque }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el bloque.");
      setBloquePorEliminar(null);
      if (bloqueAbierto === bloque) setBloqueAbierto(null);
      setMensaje(`Se eliminó el bloque «${bloque}» con todos sus contenedores.`);
      await cargarContenedoresUrgencias();
      setDataVersion((v) => v + 1);
    } catch (err) {
      setContenedoresUrgenciasError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const eliminarContenedorUrgencia = async (id: string, contenedor: string) => {
    if (!confirm(`¿Seguro que querés quitar el contenedor "${contenedor}"?`)) return;
    setContenedoresUrgenciasError(null);
    try {
      const res = await fetch(`/api/pendiente-despacho/urgencias/contenedores/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el contenedor.");
      await cargarContenedoresUrgencias();
      setDataVersion((v) => v + 1);
    } catch (err) {
      setContenedoresUrgenciasError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const bloqueExistente = bloques.find((b) => b.bloque.trim().toLowerCase() === formBloque.trim().toLowerCase());

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-4xl">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Contenedores a seguir por bloque</h2>
        <p className="text-sm text-slate-500 mb-6">
          Registrá los contenedores urgentes en bloques, con un nombre y una fecha. En Seguimiento Urgencias se
          cruzan con Pendiente de Despacho y Ocupación Almacén y se muestran separados por bloque. Pegá uno o varios
          códigos de contenedor separados por espacio, coma o salto de línea.
        </p>

        {contenedoresUrgenciasError && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {contenedoresUrgenciasError}
          </div>
        )}
        {mensaje && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{mensaje}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-6 items-start mb-2">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Contenedores (uno por línea)</label>
            <textarea
              ref={textareaRef}
              value={formContenedoresTexto}
              onChange={(e) => setFormContenedoresTexto(e.target.value)}
              placeholder={"Ej: CI121703\nCI121675\nCI122963"}
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Bloque (nombre)</label>
              <input
                type="text"
                value={formBloque}
                onChange={(e) => setFormBloque(e.target.value)}
                placeholder="Ej: URGENTES SEMANA 41"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Fecha</label>
              <input
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>
        {bloqueExistente ? (
          <p className="text-xs text-blue-700 font-medium mb-4">
            Se suman al bloque «{bloqueExistente.bloque}», que ya tiene {bloqueExistente.contenedores.length} contenedor
            {bloqueExistente.contenedores.length === 1 ? "" : "es"}.
          </p>
        ) : (
          <p className="text-xs text-slate-500 mb-4">
            Si el bloque ya existe, los contenedores se suman a ese bloque; si no, se crea uno nuevo. Un contenedor solo
            puede estar en un bloque.
          </p>
        )}
        <button
          onClick={agregarContenedoresUrgencias}
          disabled={!formValido || agregandoContenedores}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            !formValido || agregandoContenedores
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {agregandoContenedores ? "Guardando..." : "Agregar contenedores"}
        </button>

        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700">Bloques registrados ({bloques.length})</h3>
            <span className="text-xs text-slate-500">{contenedoresUrgencias.length} contenedores en total</span>
          </div>

          {contenedoresUrgenciasLoading && contenedoresUrgencias.length === 0 && (
            <p className="text-sm text-slate-400">Cargando...</p>
          )}
          {!contenedoresUrgenciasLoading && bloques.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No hay bloques cargados todavía.</p>
          )}

          <div className="space-y-3">
            {bloques.map((b) => {
              const abierto = bloqueAbierto === b.bloque;
              const confirmando = bloquePorEliminar === b.bloque;
              return (
                <div key={b.bloque} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <div className="flex items-center gap-4 flex-wrap px-4 py-3.5">
                    <div className="flex-1 min-w-[220px]">
                      <div className="font-bold text-slate-900">{b.bloque}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {b.contenedores.length} contenedor{b.contenedores.length === 1 ? "" : "es"}
                        {b.fecha ? ` · fecha ${fmtSoloFecha(b.fecha)}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => prepararAgregar(b)}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      Agregar contenedores
                    </button>
                    <button
                      onClick={() => setBloqueAbierto(abierto ? null : b.bloque)}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      {abierto ? "Ocultar contenedores" : "Ver contenedores"}
                    </button>
                    {confirmando ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-red-700">
                          Se quitan los {b.contenedores.length} contenedores de este bloque.
                        </span>
                        <button
                          onClick={() => setBloquePorEliminar(null)}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => eliminarBloque(b.bloque)}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-700 text-white hover:bg-red-800 transition-colors"
                        >
                          Sí, eliminar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setBloquePorEliminar(b.bloque)}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Eliminar bloque
                      </button>
                    )}
                  </div>
                  {abierto && (
                    <div className="px-4 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-2">
                      {b.contenedores.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono font-semibold text-slate-800"
                        >
                          {c.contenedor}
                          <button
                            onClick={() => eliminarContenedorUrgencia(c.id, c.contenedor)}
                            title="Quitar este contenedor"
                            className="w-4 h-4 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

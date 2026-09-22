"use client";

import { useRef, useState } from "react";
import { parseExcelFile, parseExcelFileConFechas } from "@/lib/fileParsers";

const INB_CHUNK_SIZE = 500;
const INB_PROD_CHUNK_SIZE = 500;

export default function INBImportar() {
  // --- Import principal ---
  const [archivosInbound, setArchivosInbound] = useState<File[]>([]);
  const [isProcesandoInbound, setIsProcesandoInbound] = useState(false);
  const [progresoInbound, setProgresoInbound] = useState(0);
  const [errorInbound, setErrorInbound] = useState<string | null>(null);
  const [resultadoInbound, setResultadoInbound] = useState<{ filasInsertadas: number } | null>(null);

  const inputInboundRef = useRef<HTMLInputElement>(null);

  const handleProcesarInbound = async () => {
    if (archivosInbound.length === 0) return;

    setIsProcesandoInbound(true);
    setProgresoInbound(0);
    setErrorInbound(null);
    setResultadoInbound(null);

    try {
      // ETD/ETA/ARRIBO AL CD pueden venir como celdas de fecha reales de Excel
      // o como texto "dd/mm/yyyy" cargado a mano (mezclado fila por fila) --
      // parseExcelFileConFechas soporta ambos casos y ya devuelve ISO.
      const listasDeRegistros = await Promise.all(
        archivosInbound.map((file) => parseExcelFileConFechas(file, ["etd", "eta", "arribo_cd"]))
      );
      const registrosCrudos = listasDeRegistros.flat();

      if (registrosCrudos.length === 0) {
        throw new Error("Los archivos seleccionados no tienen filas de datos.");
      }

      // Deduplicamos por legajo (si el archivo trae el mismo legajo repetido,
      // se queda con la última fila).
      const porLegajo = new Map<number, Record<string, unknown>>();
      for (const r of registrosCrudos) {
        const legajo = Number(r.legajo);
        if (!Number.isFinite(legajo)) continue;
        porLegajo.set(legajo, { ...r, legajo });
      }

      const records = Array.from(porLegajo.values());
      if (records.length === 0) {
        throw new Error("No se encontraron filas con LEGAJO válido.");
      }
      const legajosUnicos = Array.from(porLegajo.keys());

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += INB_CHUNK_SIZE) {
        const batch = records.slice(i, i + INB_CHUNK_SIZE);
        const res = await fetch("/api/inbound/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch,
            legajosAEliminar: i === 0 ? legajosUnicos : null,
            esPrimerLote: i === 0,
          }),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Error al procesar el archivo.");
        }

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoInbound(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoInbound({ filasInsertadas: filasInsertadasTotal });
      setProgresoInbound(100);

      sessionStorage.setItem("tabDespuesDeRefresh", "INB-Resumen");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorInbound(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoInbound(false);
    }
  };

  const resetInbound = () => {
    setArchivosInbound([]);
    setResultadoInbound(null);
    setErrorInbound(null);
    setProgresoInbound(0);
    if (inputInboundRef.current) inputInboundRef.current.value = "";
  };

  // --- Import detalle de productos (independiente del anterior) ---
  const [archivosInboundProductos, setArchivosInboundProductos] = useState<File[]>([]);
  const [isProcesandoInboundProductos, setIsProcesandoInboundProductos] = useState(false);
  const [progresoInboundProductos, setProgresoInboundProductos] = useState(0);
  const [errorInboundProductos, setErrorInboundProductos] = useState<string | null>(null);
  const [resultadoInboundProductos, setResultadoInboundProductos] = useState<{ filasInsertadas: number } | null>(null);

  const inputInboundProductosRef = useRef<HTMLInputElement>(null);

  const handleProcesarInboundProductos = async () => {
    if (archivosInboundProductos.length === 0) return;

    setIsProcesandoInboundProductos(true);
    setProgresoInboundProductos(0);
    setErrorInboundProductos(null);
    setResultadoInboundProductos(null);

    try {
      const listasDeRegistros = await Promise.all(archivosInboundProductos.map((file) => parseExcelFile(file)));
      const registros = listasDeRegistros.flat().filter((r) => Number.isFinite(Number(r.legajo)));

      if (registros.length === 0) {
        throw new Error("Los archivos seleccionados no tienen filas con LEGAJO válido.");
      }

      const legajosUnicos = Array.from(new Set(registros.map((r) => Number(r.legajo))));

      const total = registros.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < registros.length; i += INB_PROD_CHUNK_SIZE) {
        const batch = registros.slice(i, i + INB_PROD_CHUNK_SIZE);
        const res = await fetch("/api/inbound/productos/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch,
            legajosAEliminar: i === 0 ? legajosUnicos : null,
            esPrimerLote: i === 0,
          }),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Error al procesar el archivo.");
        }

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoInboundProductos(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoInboundProductos({ filasInsertadas: filasInsertadasTotal });
      setProgresoInboundProductos(100);
    } catch (err) {
      setErrorInboundProductos(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoInboundProductos(false);
    }
  };

  const resetInboundProductos = () => {
    setArchivosInboundProductos([]);
    setResultadoInboundProductos(null);
    setErrorInboundProductos(null);
    setProgresoInboundProductos(0);
    if (inputInboundProductosRef.current) inputInboundProductosRef.current.value = "";
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Inbound</h2>
        <p className="text-sm text-slate-500 mb-6">
          Subí uno o varios archivos .xlsx (misma estructura, columna LEGAJO obligatoria). Al procesar, se busca
          cada LEGAJO en la base y se reemplaza toda su información por la del archivo nuevo.
        </p>

        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
          <input
            ref={inputInboundRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => setArchivosInbound(Array.from(e.target.files ?? []))}
          />
          <button
            onClick={() => inputInboundRef.current?.click()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Seleccionar archivos .xlsx
          </button>
          {archivosInbound.length > 0 && (
            <p className="text-sm text-emerald-600 font-medium mt-3">
              {archivosInbound.length === 1
                ? "1 archivo adjuntado"
                : `${archivosInbound.length} archivos adjuntados`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleProcesarInbound}
            disabled={archivosInbound.length === 0 || isProcesandoInbound}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              archivosInbound.length === 0 || isProcesandoInbound
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isProcesandoInbound ? "Procesando..." : "Procesar"}
          </button>
          <button
            onClick={resetInbound}
            disabled={isProcesandoInbound}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Limpiar
          </button>
        </div>

        {isProcesandoInbound && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Procesando datos...</span>
              <span className="font-semibold text-slate-700">{progresoInbound}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progresoInbound}%` }}
              />
            </div>
          </div>
        )}

        {errorInbound && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {errorInbound}
          </div>
        )}

        {resultadoInbound && !errorInbound && (
          <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            {resultadoInbound.filasInsertadas} filas cargadas correctamente. Actualizando la app...
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl mt-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Detalle de Productos</h2>
        <p className="text-sm text-slate-500 mb-6">
          Importación independiente de la anterior -- no hace falta actualizarla siempre. Subí uno o varios
          archivos .xlsx con columnas LEGAJO, ETAPA, MASTER, DESCRIPCION, MARCA, GRUPO. Al procesar, se busca
          cada LEGAJO en la base y se reemplaza todo su detalle de productos por el del archivo nuevo.
        </p>

        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
          <input
            ref={inputInboundProductosRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => setArchivosInboundProductos(Array.from(e.target.files ?? []))}
          />
          <button
            onClick={() => inputInboundProductosRef.current?.click()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Seleccionar archivos .xlsx
          </button>
          {archivosInboundProductos.length > 0 && (
            <p className="text-sm text-emerald-600 font-medium mt-3">
              {archivosInboundProductos.length === 1
                ? "1 archivo adjuntado"
                : `${archivosInboundProductos.length} archivos adjuntados`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleProcesarInboundProductos}
            disabled={archivosInboundProductos.length === 0 || isProcesandoInboundProductos}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              archivosInboundProductos.length === 0 || isProcesandoInboundProductos
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isProcesandoInboundProductos ? "Procesando..." : "Procesar"}
          </button>
          <button
            onClick={resetInboundProductos}
            disabled={isProcesandoInboundProductos}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Limpiar
          </button>
        </div>

        {isProcesandoInboundProductos && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Procesando datos...</span>
              <span className="font-semibold text-slate-700">{progresoInboundProductos}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progresoInboundProductos}%` }}
              />
            </div>
          </div>
        )}

        {errorInboundProductos && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {errorInboundProductos}
          </div>
        )}

        {resultadoInboundProductos && !errorInboundProductos && (
          <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            {resultadoInboundProductos.filasInsertadas} filas cargadas correctamente.
          </div>
        )}
      </div>
    </>
  );
}

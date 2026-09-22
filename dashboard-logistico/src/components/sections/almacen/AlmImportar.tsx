"use client";

import { useRef, useState } from "react";
import { parseCsvFile, parseExcelFile, parseOcupacionAlmacenStreaming } from "@/lib/fileParsers";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";

const ALM_OCUPACION_CHUNK_SIZE = 2000;

export default function AlmImportar() {
  const { tienePermiso, setDataVersion } = useDashboard();

  // --- Importar Layout ---
  const [archivoLayoutAlmacen, setArchivoLayoutAlmacen] = useState<File | null>(null);
  const [isImportandoLayoutAlmacen, setIsImportandoLayoutAlmacen] = useState(false);
  const [errorLayoutAlmacen, setErrorLayoutAlmacen] = useState<string | null>(null);
  const [resultadoLayoutAlmacen, setResultadoLayoutAlmacen] = useState<{ filasInsertadas: number } | null>(null);
  const inputLayoutAlmacenRef = useRef<HTMLInputElement>(null);

  const handleImportarLayoutAlmacen = async () => {
    if (!archivoLayoutAlmacen) return;

    setIsImportandoLayoutAlmacen(true);
    setErrorLayoutAlmacen(null);
    setResultadoLayoutAlmacen(null);

    try {
      const esCsv = archivoLayoutAlmacen.name.toLowerCase().endsWith(".csv");
      const registros = esCsv ? await parseCsvFile(archivoLayoutAlmacen) : await parseExcelFile(archivoLayoutAlmacen);

      if (registros.length === 0) {
        throw new Error("El archivo no tiene filas de datos.");
      }

      const filas = registros.map((r) => ({
        nave: r.nave != null ? String(r.nave) : null,
        ubicacion: r.ubicacion != null ? String(r.ubicacion) : "",
        zona: r.zona != null ? String(r.zona) : "",
      }));

      const res = await fetch("/api/almacen/layout/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo importar el layout.");

      setResultadoLayoutAlmacen({ filasInsertadas: data.filasInsertadas });
      setDataVersion((v) => v + 1);
    } catch (err) {
      setErrorLayoutAlmacen(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsImportandoLayoutAlmacen(false);
    }
  };

  const resetLayoutAlmacen = () => {
    setArchivoLayoutAlmacen(null);
    setResultadoLayoutAlmacen(null);
    setErrorLayoutAlmacen(null);
    if (inputLayoutAlmacenRef.current) inputLayoutAlmacenRef.current.value = "";
  };

  // --- Importar Ocupación ---
  const [archivoOcupacionAlmacen, setArchivoOcupacionAlmacen] = useState<File | null>(null);
  const [isProcesandoOcupacionAlmacen, setIsProcesandoOcupacionAlmacen] = useState(false);
  const [etapaOcupacionAlmacen, setEtapaOcupacionAlmacen] = useState<"leyendo" | "subiendo" | null>(null);
  const [progresoOcupacionAlmacen, setProgresoOcupacionAlmacen] = useState(0);
  const [errorOcupacionAlmacen, setErrorOcupacionAlmacen] = useState<string | null>(null);
  const [resultadoOcupacionAlmacen, setResultadoOcupacionAlmacen] = useState<{ filasInsertadas: number } | null>(null);
  const inputOcupacionAlmacenRef = useRef<HTMLInputElement>(null);

  const handleProcesarOcupacionAlmacen = async () => {
    if (!archivoOcupacionAlmacen) return;

    setIsProcesandoOcupacionAlmacen(true);
    setEtapaOcupacionAlmacen("leyendo");
    setProgresoOcupacionAlmacen(0);
    setErrorOcupacionAlmacen(null);
    setResultadoOcupacionAlmacen(null);

    try {
      // Todo el trabajo pesado (leer y pivotear ~740.000 filas) pasa acá,
      // en el navegador y en modo streaming -- el archivo original nunca
      // sale de la máquina, solo el resultado ya limpio y deduplicado.
      const filas = await parseOcupacionAlmacenStreaming(archivoOcupacionAlmacen, setProgresoOcupacionAlmacen);

      if (filas.length === 0) {
        throw new Error("No se encontraron posiciones ocupadas (Stock > 0) en el archivo.");
      }

      setEtapaOcupacionAlmacen("subiendo");
      setProgresoOcupacionAlmacen(0);

      const total = filas.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < filas.length; i += ALM_OCUPACION_CHUNK_SIZE) {
        const batch = filas.slice(i, i + ALM_OCUPACION_CHUNK_SIZE);
        const res = await fetch("/api/almacen/ocupacion/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch, esPrimerLote: i === 0 }),
        });

        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
        }
        if (!res.ok || !data.success) throw new Error(data.error || "Error al procesar el archivo.");

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoOcupacionAlmacen(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoOcupacionAlmacen({ filasInsertadas: filasInsertadasTotal });
      setDataVersion((v) => v + 1);
    } catch (err) {
      setErrorOcupacionAlmacen(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoOcupacionAlmacen(false);
      setEtapaOcupacionAlmacen(null);
    }
  };

  const resetOcupacionAlmacen = () => {
    setArchivoOcupacionAlmacen(null);
    setResultadoOcupacionAlmacen(null);
    setErrorOcupacionAlmacen(null);
    setProgresoOcupacionAlmacen(0);
    if (inputOcupacionAlmacenRef.current) inputOcupacionAlmacenRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {tienePermiso("ALM-ImportarLayout") && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Layout del Almacén</h2>
          <p className="text-sm text-slate-500 mb-6">
            Archivo con las columnas Nave, Ubicacion y Zona -- una fila por posición física. Reemplaza por
            completo el layout anterior. Solo hace falta reimportarlo si cambia la distribución del almacén.
          </p>

          <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
            <input
              ref={inputLayoutAlmacenRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => setArchivoLayoutAlmacen(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => inputLayoutAlmacenRef.current?.click()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              Seleccionar archivo
            </button>
            {archivoLayoutAlmacen && (
              <p className="text-sm text-emerald-600 font-medium mt-3">{archivoLayoutAlmacen.name}</p>
            )}
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={handleImportarLayoutAlmacen}
              disabled={!archivoLayoutAlmacen || isImportandoLayoutAlmacen}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                !archivoLayoutAlmacen || isImportandoLayoutAlmacen
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isImportandoLayoutAlmacen ? "Importando..." : "Importar Layout"}
            </button>
            <button
              onClick={resetLayoutAlmacen}
              disabled={isImportandoLayoutAlmacen}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Limpiar
            </button>
          </div>

          {errorLayoutAlmacen && (
            <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {errorLayoutAlmacen}
            </div>
          )}
          {resultadoLayoutAlmacen && !errorLayoutAlmacen && (
            <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
              {resultadoLayoutAlmacen.filasInsertadas} posiciones cargadas correctamente.
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Ocupación</h2>
        <p className="text-sm text-slate-500 mb-6">
          Subí el archivo de ocupación completo (columnas Ubicacion, Contenedor, Stock). Se procesa entero en
          tu navegador -- solo se sube el resultado ya limpio, nunca el archivo original.
        </p>

        {tienePermiso("ALM-ActualizarWMS") && (
          <>
            <AgenteTokenPanel />
            <ActualizarAgenteBoton seccion="ocupacion_almacen" onExito={() => setDataVersion((v) => v + 1)} />
          </>
        )}

        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
          <input
            ref={inputOcupacionAlmacenRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setArchivoOcupacionAlmacen(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => inputOcupacionAlmacenRef.current?.click()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Seleccionar archivo .csv
          </button>
          {archivoOcupacionAlmacen && (
            <p className="text-sm text-emerald-600 font-medium mt-3">
              {archivoOcupacionAlmacen.name} ({(archivoOcupacionAlmacen.size / 1024 / 1024).toFixed(1)} MB)
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleProcesarOcupacionAlmacen}
            disabled={!archivoOcupacionAlmacen || isProcesandoOcupacionAlmacen}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              !archivoOcupacionAlmacen || isProcesandoOcupacionAlmacen
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isProcesandoOcupacionAlmacen ? "Procesando..." : "Procesar archivo"}
          </button>
          <button
            onClick={resetOcupacionAlmacen}
            disabled={isProcesandoOcupacionAlmacen}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Limpiar
          </button>
        </div>

        {isProcesandoOcupacionAlmacen && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>{etapaOcupacionAlmacen === "subiendo" ? "Subiendo resultado..." : "Leyendo y limpiando archivo..."}</span>
              <span className="font-semibold text-slate-700">{progresoOcupacionAlmacen}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progresoOcupacionAlmacen}%` }}
              />
            </div>
          </div>
        )}

        {errorOcupacionAlmacen && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {errorOcupacionAlmacen}
          </div>
        )}
        {resultadoOcupacionAlmacen && !errorOcupacionAlmacen && (
          <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            {resultadoOcupacionAlmacen.filasInsertadas} posiciones ocupadas actualizadas correctamente.
          </div>
        )}
      </div>
    </div>
  );
}

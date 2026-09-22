"use client";

import { useRef, useState } from "react";
import { parseCsvFile } from "@/lib/fileParsers";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";

const REM_CHUNK_SIZE = 500;

export default function RemImportar() {
  const { tienePermiso, setDataVersion } = useDashboard();

  const [archivosRemanentes, setArchivosRemanentes] = useState<File[]>([]);
  const [isProcesandoRemanentes, setIsProcesandoRemanentes] = useState(false);
  const [progresoRemanentes, setProgresoRemanentes] = useState(0);
  const [errorRemanentes, setErrorRemanentes] = useState<string | null>(null);
  const [resultadoRemanentes, setResultadoRemanentes] = useState<{ filasInsertadas: number } | null>(null);

  const inputRemanentesRef = useRef<HTMLInputElement>(null);

  const handleProcesarRemanentes = async () => {
    if (archivosRemanentes.length === 0) return;

    setIsProcesandoRemanentes(true);
    setProgresoRemanentes(0);
    setErrorRemanentes(null);
    setResultadoRemanentes(null);

    try {
      // Parseamos todos los archivos seleccionados (misma estructura, se combinan)
      const listasDeRegistros = await Promise.all(
        archivosRemanentes.map((file) => parseCsvFile(file))
      );
      const records = listasDeRegistros.flat();

      if (records.length === 0) {
        throw new Error("Los archivos seleccionados no tienen filas de datos.");
      }

      const numerosUnicos = Array.from(
        new Set(records.map((r) => r.numero).filter((v) => v !== null && v !== undefined && v !== ""))
      );

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += REM_CHUNK_SIZE) {
        const batch = records.slice(i, i + REM_CHUNK_SIZE);
        const res = await fetch("/api/remanentes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch,
            numerosAEliminar: i === 0 ? numerosUnicos : null,
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
        setProgresoRemanentes(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoRemanentes({ filasInsertadas: filasInsertadasTotal });
      setProgresoRemanentes(100);

      // Refresh completo de la app para que todo se vea actualizado. Guardamos
      // en sessionStorage a qué pestaña volver, ya que el reload reinicia el estado de React.
      sessionStorage.setItem("tabDespuesDeRefresh", "REM-Resumen");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorRemanentes(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoRemanentes(false);
    }
  };

  const resetRemanentes = () => {
    setArchivosRemanentes([]);
    setResultadoRemanentes(null);
    setErrorRemanentes(null);
    setProgresoRemanentes(0);
    if (inputRemanentesRef.current) inputRemanentesRef.current.value = "";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Remanentes</h2>
      <p className="text-sm text-slate-500 mb-6">
        Subí uno o varios archivos .csv (misma estructura). Al procesar, se busca cada
        &quot;Numero&quot; en la base y se reemplaza toda su información por la del archivo nuevo.
      </p>

      {tienePermiso("REM-ActualizarWMS") && (
        <>
          <AgenteTokenPanel />
          <ActualizarAgenteBoton seccion="remanentes" onExito={() => setDataVersion((v) => v + 1)} />
        </>
      )}

      <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center mt-6">
        <input
          ref={inputRemanentesRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={(e) => setArchivosRemanentes(Array.from(e.target.files ?? []))}
        />
        <button
          onClick={() => inputRemanentesRef.current?.click()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          Seleccionar archivos .csv
        </button>
        {archivosRemanentes.length > 0 && (
          <p className="text-sm text-emerald-600 font-medium mt-3">
            {archivosRemanentes.length === 1
              ? "1 archivo adjuntado"
              : `${archivosRemanentes.length} archivos adjuntados`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleProcesarRemanentes}
          disabled={archivosRemanentes.length === 0 || isProcesandoRemanentes}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            archivosRemanentes.length === 0 || isProcesandoRemanentes
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isProcesandoRemanentes ? "Procesando..." : "Procesar"}
        </button>
        <button
          onClick={resetRemanentes}
          disabled={isProcesandoRemanentes}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          Limpiar
        </button>
      </div>

      {/* --- BARRA DE PROGRESO --- */}
      {isProcesandoRemanentes && (
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Procesando datos...</span>
            <span className="font-semibold text-slate-700">{progresoRemanentes}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progresoRemanentes}%` }}
            />
          </div>
        </div>
      )}

      {errorRemanentes && (
        <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {errorRemanentes}
        </div>
      )}

      {resultadoRemanentes && !errorRemanentes && (
        <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {resultadoRemanentes.filasInsertadas} filas cargadas correctamente. Actualizando la app...
        </div>
      )}
    </div>
  );
}

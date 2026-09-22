"use client";

import { useRef, useState } from "react";
import { parseCsvFile } from "@/lib/fileParsers";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";

const CI_CHUNK_SIZE = 500;

export default function CIImportar() {
  const { tienePermiso, setDataVersion } = useDashboard();

  const [archivosCargaInicial, setArchivosCargaInicial] = useState<File[]>([]);
  const [isProcesandoCargaInicial, setIsProcesandoCargaInicial] = useState(false);
  const [progresoCargaInicial, setProgresoCargaInicial] = useState(0);
  const [errorCargaInicial, setErrorCargaInicial] = useState<string | null>(null);
  const [resultadoCargaInicial, setResultadoCargaInicial] = useState<{ filasInsertadas: number } | null>(null);

  const inputCargaInicialRef = useRef<HTMLInputElement>(null);

  const handleProcesarCargaInicial = async () => {
    if (archivosCargaInicial.length === 0) return;

    setIsProcesandoCargaInicial(true);
    setProgresoCargaInicial(0);
    setErrorCargaInicial(null);
    setResultadoCargaInicial(null);

    try {
      // Parseamos todos los archivos seleccionados (misma estructura, se combinan)
      const listasDeRegistros = await Promise.all(
        archivosCargaInicial.map((file) => parseCsvFile(file))
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

      for (let i = 0; i < records.length; i += CI_CHUNK_SIZE) {
        const batch = records.slice(i, i + CI_CHUNK_SIZE);
        const res = await fetch("/api/carga-inicial/import", {
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
        setProgresoCargaInicial(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoCargaInicial({ filasInsertadas: filasInsertadasTotal });
      setProgresoCargaInicial(100);

      // Refresh completo de la app para que todo se vea actualizado. Guardamos
      // en sessionStorage a qué pestaña volver, ya que el reload reinicia el estado de React.
      sessionStorage.setItem("tabDespuesDeRefresh", "CI-Resumen");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorCargaInicial(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoCargaInicial(false);
    }
  };

  const resetCargaInicial = () => {
    setArchivosCargaInicial([]);
    setResultadoCargaInicial(null);
    setErrorCargaInicial(null);
    setProgresoCargaInicial(0);
    if (inputCargaInicialRef.current) inputCargaInicialRef.current.value = "";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Carga Inicial</h2>
      <p className="text-sm text-slate-500 mb-6">
        Subí uno o varios archivos .csv (misma estructura). Al procesar, se busca cada
        &quot;Numero&quot; en la base y se reemplaza toda su información por la del archivo nuevo.
      </p>

      {tienePermiso("CI-ActualizarWMS") && (
        <>
          <AgenteTokenPanel />
          <ActualizarAgenteBoton seccion="carga_inicial" onExito={() => setDataVersion((v) => v + 1)} />
        </>
      )}

      <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center mt-6">
        <input
          ref={inputCargaInicialRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={(e) => setArchivosCargaInicial(Array.from(e.target.files ?? []))}
        />
        <button
          onClick={() => inputCargaInicialRef.current?.click()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          Seleccionar archivos .csv
        </button>
        {archivosCargaInicial.length > 0 && (
          <p className="text-sm text-emerald-600 font-medium mt-3">
            {archivosCargaInicial.length === 1
              ? "1 archivo adjuntado"
              : `${archivosCargaInicial.length} archivos adjuntados`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleProcesarCargaInicial}
          disabled={archivosCargaInicial.length === 0 || isProcesandoCargaInicial}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            archivosCargaInicial.length === 0 || isProcesandoCargaInicial
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isProcesandoCargaInicial ? "Procesando..." : "Procesar"}
        </button>
        <button
          onClick={resetCargaInicial}
          disabled={isProcesandoCargaInicial}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          Limpiar
        </button>
      </div>

      {/* --- BARRA DE PROGRESO --- */}
      {isProcesandoCargaInicial && (
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Procesando datos...</span>
            <span className="font-semibold text-slate-700">{progresoCargaInicial}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progresoCargaInicial}%` }}
            />
          </div>
        </div>
      )}

      {errorCargaInicial && (
        <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {errorCargaInicial}
        </div>
      )}

      {resultadoCargaInicial && !errorCargaInicial && (
        <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {resultadoCargaInicial.filasInsertadas} filas cargadas correctamente. Actualizando la app...
        </div>
      )}
    </div>
  );
}

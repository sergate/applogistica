"use client";

import { useRef, useState } from "react";
import { parseExcelFile } from "@/lib/fileParsers";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";

const PROD_CHUNK_SIZE = 500;

// Convierte "20/07/2026" (dd/mm/yyyy, como viene en el Excel) a "2026-07-20" (ISO)
function fechaDDMMYYYYaISO(fecha: string): string | null {
  const m = fecha.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export default function ProdImportar() {
  const { tienePermiso, setDataVersion } = useDashboard();

  const [archivosProductividad, setArchivosProductividad] = useState<File[]>([]);
  const [isProcesandoProductividad, setIsProcesandoProductividad] = useState(false);
  const [progresoProductividad, setProgresoProductividad] = useState(0);
  const [errorProductividad, setErrorProductividad] = useState<string | null>(null);
  const [resultadoProductividad, setResultadoProductividad] = useState<{ filasInsertadas: number } | null>(null);

  const inputProductividadRef = useRef<HTMLInputElement>(null);

  const handleProcesarProductividad = async () => {
    if (archivosProductividad.length === 0) return;

    setIsProcesandoProductividad(true);
    setProgresoProductividad(0);
    setErrorProductividad(null);
    setResultadoProductividad(null);

    try {
      // Parseamos todos los archivos seleccionados (misma estructura, se combinan)
      const listasDeRegistros = await Promise.all(
        archivosProductividad.map((file) => parseExcelFile(file))
      );
      let records = listasDeRegistros.flat();

      // Normalizamos la fecha de dd/mm/yyyy a ISO para que se pueda usar
      // como clave de reemplazo y para que ordene bien en el resumen.
      records = records.map((r) => {
        const fechaOriginal = typeof r.fecha === "string" ? r.fecha : "";
        const fechaISO = fechaDDMMYYYYaISO(fechaOriginal);
        return { ...r, fecha: fechaISO ?? fechaOriginal };
      });

      if (records.length === 0) {
        throw new Error("Los archivos seleccionados no tienen filas de datos.");
      }

      // Para cada fecha presente en el archivo, juntamos los tipos de proceso
      // que trae -- solo esas combinaciones exactas (fecha + tipo_proceso) se
      // reemplazan; el resto de los procesos de esa misma fecha no se tocan.
      const tiposPorFecha = new Map<string, Set<string>>();
      for (const r of records) {
        const fecha = typeof r.fecha === "string" ? r.fecha : "";
        const tipo = typeof r.tipo_proceso === "string" ? r.tipo_proceso : "";
        if (!fecha || !tipo) continue;
        if (!tiposPorFecha.has(fecha)) tiposPorFecha.set(fecha, new Set());
        tiposPorFecha.get(fecha)!.add(tipo);
      }
      const combinacionesAEliminar = Array.from(tiposPorFecha.entries()).map(([fecha, tipos]) => ({
        fecha,
        tipos: Array.from(tipos),
      }));

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += PROD_CHUNK_SIZE) {
        const batch = records.slice(i, i + PROD_CHUNK_SIZE);
        const res = await fetch("/api/productividad/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch,
            combinacionesAEliminar: i === 0 ? combinacionesAEliminar : null,
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
        setProgresoProductividad(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoProductividad({ filasInsertadas: filasInsertadasTotal });
      setProgresoProductividad(100);

      // Refresh completo de la app para que todo se vea actualizado. Guardamos
      // en sessionStorage a qué pestaña volver, ya que el reload reinicia el estado de React.
      sessionStorage.setItem("tabDespuesDeRefresh", "PROD-Resumen");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorProductividad(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoProductividad(false);
    }
  };

  const resetProductividad = () => {
    setArchivosProductividad([]);
    setResultadoProductividad(null);
    setErrorProductividad(null);
    setProgresoProductividad(0);
    if (inputProductividadRef.current) inputProductividadRef.current.value = "";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Producción</h2>
      <p className="text-sm text-slate-500 mb-6">
        Subí uno o varios archivos .xlsx (misma estructura). Al procesar, se busca cada
        &quot;Fecha&quot; en la base y se reemplaza toda su información por la del archivo nuevo.
      </p>

      {tienePermiso("PROD-ActualizarWMS") && (
        <>
          <AgenteTokenPanel />
          <ActualizarAgenteBoton seccion="productividad" onExito={() => setDataVersion((v) => v + 1)} />
        </>
      )}

      <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
        <input
          ref={inputProductividadRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={(e) => setArchivosProductividad(Array.from(e.target.files ?? []))}
        />
        <button
          onClick={() => inputProductividadRef.current?.click()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          Seleccionar archivos .xlsx
        </button>
        {archivosProductividad.length > 0 && (
          <p className="text-sm text-emerald-600 font-medium mt-3">
            {archivosProductividad.length === 1
              ? "1 archivo adjuntado"
              : `${archivosProductividad.length} archivos adjuntados`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleProcesarProductividad}
          disabled={archivosProductividad.length === 0 || isProcesandoProductividad}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            archivosProductividad.length === 0 || isProcesandoProductividad
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isProcesandoProductividad ? "Procesando..." : "Procesar"}
        </button>
        <button
          onClick={resetProductividad}
          disabled={isProcesandoProductividad}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          Limpiar
        </button>
      </div>

      {/* --- BARRA DE PROGRESO --- */}
      {isProcesandoProductividad && (
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Procesando datos...</span>
            <span className="font-semibold text-slate-700">{progresoProductividad}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progresoProductividad}%` }}
            />
          </div>
        </div>
      )}

      {errorProductividad && (
        <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {errorProductividad}
        </div>
      )}

      {resultadoProductividad && !errorProductividad && (
        <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {resultadoProductividad.filasInsertadas} filas cargadas correctamente. Actualizando la app...
        </div>
      )}
    </div>
  );
}

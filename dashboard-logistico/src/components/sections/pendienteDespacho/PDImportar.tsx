"use client";

import { useRef, useState } from "react";
import { parseExcelFile } from "@/lib/fileParsers";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { useDashboard } from "@/components/dashboard/DashboardContext";

const PD_CHUNK_SIZE = 500;

// El export tiene encabezados con entidades HTML mal decodificadas (ej.
// "N&uacute;mero", "Ubicaci&oacute;n"); parseExcelFile normaliza eso a
// "n_uacute_mero" / "ubicaci_oacute_n" -- acá les damos el nombre de
// columna final.
const RENOMBRE_COLUMNAS_PD: Record<string, string> = {
  n_uacute_mero: "numero",
  ubicaci_oacute_n: "ubicacion",
  unida: "unidades", // "Unida." (archivo de Clientes)
  uni: "unidades", // "Uni" (archivo de Propios)
};

// Columnas del reporte del WMS que no se insertan -- no existen como
// columna en la tabla y no aportan valor para la app (ej. "Separación
// ID", agregada al reporte pero sin uso acá).
const CAMPOS_A_IGNORAR_PD = new Set(["separacion_id"]);

// "Fecha"/"Fecha envio gaci"/"F.remito" vienen como texto "d/m/yyyy, H:mm:ss".
function fechaHoraExcelAISO(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mo, y, h, min, s] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min}:${s}`;
}

// El campo "Número" viene envuelto en un tag literal: "<span >CI1409323</span>".
function extraerNumeroDeSpan(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^<span\s*>([\s\S]*)<\/span>$/);
  return m ? m[1].trim() : valor.trim();
}

export default function PDImportar() {
  const { tienePermiso, setDataVersion } = useDashboard();

  // --- Clientes ---
  const [archivoPDClientes, setArchivoPDClientes] = useState<File | null>(null);
  const [isProcesandoPDClientes, setIsProcesandoPDClientes] = useState(false);
  const [progresoPDClientes, setProgresoPDClientes] = useState(0);
  const [errorPDClientes, setErrorPDClientes] = useState<string | null>(null);
  const [resultadoPDClientes, setResultadoPDClientes] = useState<{ filasInsertadas: number } | null>(null);

  const inputPDClientesRef = useRef<HTMLInputElement>(null);

  const handleProcesarPDClientes = async () => {
    if (!archivoPDClientes) return;

    setIsProcesandoPDClientes(true);
    setProgresoPDClientes(0);
    setErrorPDClientes(null);
    setResultadoPDClientes(null);

    try {
      const registrosCrudos = await parseExcelFile(archivoPDClientes);
      if (registrosCrudos.length === 0) {
        throw new Error("El archivo no tiene filas de datos.");
      }

      const CAMPOS_FECHA_PD = new Set(["fecha", "fecha_envio_gaci", "f_remito"]);
      const records = registrosCrudos.map((r) => {
        const renombrado: Record<string, unknown> = {};
        for (const key of Object.keys(r)) {
          const nombreFinal = RENOMBRE_COLUMNAS_PD[key] || key;
          if (CAMPOS_A_IGNORAR_PD.has(nombreFinal)) continue;
          renombrado[nombreFinal] = CAMPOS_FECHA_PD.has(nombreFinal) ? fechaHoraExcelAISO(r[key]) : r[key];
        }
        return renombrado;
      });

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += PD_CHUNK_SIZE) {
        const batch = records.slice(i, i + PD_CHUNK_SIZE);
        const res = await fetch("/api/pendiente-despacho/clientes/import", {
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
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Error al procesar el archivo.");
        }

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoPDClientes(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoPDClientes({ filasInsertadas: filasInsertadasTotal });
      setProgresoPDClientes(100);

      sessionStorage.setItem("tabDespuesDeRefresh", "PD-Clientes");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorPDClientes(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoPDClientes(false);
    }
  };

  const resetPDClientes = () => {
    setArchivoPDClientes(null);
    setResultadoPDClientes(null);
    setErrorPDClientes(null);
    setProgresoPDClientes(0);
    if (inputPDClientesRef.current) inputPDClientesRef.current.value = "";
  };

  // --- Propios ---
  const [archivoPDPropios, setArchivoPDPropios] = useState<File | null>(null);
  const [isProcesandoPDPropios, setIsProcesandoPDPropios] = useState(false);
  const [progresoPDPropios, setProgresoPDPropios] = useState(0);
  const [errorPDPropios, setErrorPDPropios] = useState<string | null>(null);
  const [resultadoPDPropios, setResultadoPDPropios] = useState<{ filasInsertadas: number } | null>(null);

  const inputPDPropiosRef = useRef<HTMLInputElement>(null);

  const handleProcesarPDPropios = async () => {
    if (!archivoPDPropios) return;

    setIsProcesandoPDPropios(true);
    setProgresoPDPropios(0);
    setErrorPDPropios(null);
    setResultadoPDPropios(null);

    try {
      const registrosCrudos = await parseExcelFile(archivoPDPropios);
      if (registrosCrudos.length === 0) {
        throw new Error("El archivo no tiene filas de datos.");
      }

      const records = registrosCrudos.map((r) => {
        const renombrado: Record<string, unknown> = {};
        for (const key of Object.keys(r)) {
          const nombreFinal = RENOMBRE_COLUMNAS_PD[key] || key;
          if (CAMPOS_A_IGNORAR_PD.has(nombreFinal)) continue;
          if (nombreFinal === "numero") {
            renombrado.numero = extraerNumeroDeSpan(r[key]);
          } else if (nombreFinal === "fecha") {
            renombrado.fecha = fechaHoraExcelAISO(r[key]);
          } else {
            renombrado[nombreFinal] = r[key];
          }
        }
        return renombrado;
      });

      const total = records.length;
      let procesados = 0;
      let filasInsertadasTotal = 0;

      for (let i = 0; i < records.length; i += PD_CHUNK_SIZE) {
        const batch = records.slice(i, i + PD_CHUNK_SIZE);
        const res = await fetch("/api/pendiente-despacho/propios/import", {
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
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Error al procesar el archivo.");
        }

        filasInsertadasTotal += data.filasInsertadas ?? batch.length;
        procesados += batch.length;
        setProgresoPDPropios(Math.min(100, Math.round((procesados / total) * 100)));
      }

      setResultadoPDPropios({ filasInsertadas: filasInsertadasTotal });
      setProgresoPDPropios(100);

      sessionStorage.setItem("tabDespuesDeRefresh", "PD-Propios");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setErrorPDPropios(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoPDPropios(false);
    }
  };

  const resetPDPropios = () => {
    setArchivoPDPropios(null);
    setResultadoPDPropios(null);
    setErrorPDPropios(null);
    setProgresoPDPropios(0);
    if (inputPDPropiosRef.current) inputPDPropiosRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Pendiente de Despacho — Clientes</h2>
        <p className="text-sm text-slate-500 mb-6">
          Subí el archivo .xlsx de contenedores. Es una foto completa y vigente: al procesar, se reemplaza
          todo lo que había cargado antes en esta tabla.
        </p>

        {tienePermiso("PD-Clientes-ActualizarWMS") && (
          <>
            <AgenteTokenPanel />
            <ActualizarAgenteBoton seccion="pd_clientes" onExito={() => setDataVersion((v) => v + 1)} />
          </>
        )}

        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
          <input
            ref={inputPDClientesRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setArchivoPDClientes(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => inputPDClientesRef.current?.click()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Seleccionar archivo .xlsx
          </button>
          {archivoPDClientes && (
            <p className="text-sm text-emerald-600 font-medium mt-3">{archivoPDClientes.name}</p>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleProcesarPDClientes}
            disabled={!archivoPDClientes || isProcesandoPDClientes}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              !archivoPDClientes || isProcesandoPDClientes
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isProcesandoPDClientes ? "Procesando..." : "Procesar"}
          </button>
          <button
            onClick={resetPDClientes}
            disabled={isProcesandoPDClientes}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Limpiar
          </button>
        </div>

        {isProcesandoPDClientes && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Procesando datos...</span>
              <span className="font-semibold text-slate-700">{progresoPDClientes}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progresoPDClientes}%` }}
              />
            </div>
          </div>
        )}

        {errorPDClientes && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {errorPDClientes}
          </div>
        )}

        {resultadoPDClientes && !errorPDClientes && (
          <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            {resultadoPDClientes.filasInsertadas} filas cargadas correctamente. Actualizando la app...
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Pendiente de Despacho — Propios</h2>
        <p className="text-sm text-slate-500 mb-6">
          Subí el archivo .xlsx de contenedores propios. Es una foto completa y vigente: al procesar, se
          reemplaza todo lo que había cargado antes en esta tabla.
        </p>

        {tienePermiso("PD-Propios-ActualizarWMS") && (
          <>
            <AgenteTokenPanel />
            <ActualizarAgenteBoton seccion="pd_propios" onExito={() => setDataVersion((v) => v + 1)} />
          </>
        )}

        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
          <input
            ref={inputPDPropiosRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setArchivoPDPropios(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => inputPDPropiosRef.current?.click()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Seleccionar archivo .xlsx
          </button>
          {archivoPDPropios && (
            <p className="text-sm text-emerald-600 font-medium mt-3">{archivoPDPropios.name}</p>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleProcesarPDPropios}
            disabled={!archivoPDPropios || isProcesandoPDPropios}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              !archivoPDPropios || isProcesandoPDPropios
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isProcesandoPDPropios ? "Procesando..." : "Procesar"}
          </button>
          <button
            onClick={resetPDPropios}
            disabled={isProcesandoPDPropios}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Limpiar
          </button>
        </div>

        {isProcesandoPDPropios && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Procesando datos...</span>
              <span className="font-semibold text-slate-700">{progresoPDPropios}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progresoPDPropios}%` }}
              />
            </div>
          </div>
        )}

        {errorPDPropios && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {errorPDPropios}
          </div>
        )}

        {resultadoPDPropios && !errorPDPropios && (
          <div className="mt-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            {resultadoPDPropios.filasInsertadas} filas cargadas correctamente. Actualizando la app...
          </div>
        )}
      </div>
    </div>
  );
}

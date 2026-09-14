"use client";

import { useRef, useState } from "react";
import { parseCsvFile } from "@/lib/fileParsers";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { enviarArchivoEnLotes, type ImportFileResult } from "@/lib/importMaestros";

export default function EcomImportar() {
  const { setDataVersion, setActiveTab, tienePermiso } = useDashboard();

  const [archivoEcom, setArchivoEcom] = useState<File | null>(null);
  const [isProcesandoEcom, setIsProcesandoEcom] = useState(false);
  const [progresoImportEcom, setProgresoImportEcom] = useState(0);
  const [resultadoImportEcom, setResultadoImportEcom] = useState<ImportFileResult | null>(null);
  const [errorImportEcom, setErrorImportEcom] = useState<string | null>(null);
  const inputEcomRef = useRef<HTMLInputElement>(null);

  const handleProcesarDatosEcom = async () => {
    if (!archivoEcom) return;

    setIsProcesandoEcom(true);
    setProgresoImportEcom(0);
    setErrorImportEcom(null);
    setResultadoImportEcom(null);

    try {
      const records = await parseCsvFile(archivoEcom);
      if (records.length === 0) {
        setResultadoImportEcom({ archivo: "ecom", filasLeidas: 0, filasInsertadas: 0, error: "El archivo no tiene filas de datos." });
        return;
      }
      const { filasInsertadas } = await enviarArchivoEnLotes("ecom", records, (cantidad) => {
        setProgresoImportEcom((prev) => {
          const procesados = Math.round((prev / 100) * records.length) + cantidad;
          return Math.min(100, Math.round((procesados / records.length) * 100));
        });
      });
      setProgresoImportEcom(100);
      setResultadoImportEcom({ archivo: "ecom", filasLeidas: records.length, filasInsertadas, error: null });
      setDataVersion((v) => v + 1);
      setTimeout(() => setActiveTab("ECOM-Resumen"), 800);
    } catch (err) {
      setErrorImportEcom(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesandoEcom(false);
    }
  };

  const resetImportEcomState = () => {
    setArchivoEcom(null);
    setResultadoImportEcom(null);
    setErrorImportEcom(null);
    if (inputEcomRef.current) inputEcomRef.current.value = "";
  };

  return (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Pedidos Ecom</h2>
              <p className="text-sm text-slate-500 mb-6">
                Subí el archivo de pedidos de e-commerce (CSV). Al procesar, reemplaza por completo los datos de Ecom en Supabase.
              </p>

              {tienePermiso("ECOM-ActualizarWMS") && (
                <>
                  <AgenteTokenPanel />
                  <ActualizarAgenteBoton seccion="ecom" onExito={() => setDataVersion((v) => v + 1)} />
                </>
              )}

              <div className="space-y-4 mt-6">
                <div className="flex items-center justify-between border border-slate-200 rounded-lg p-4">
                  <div>
                    <p className="font-semibold text-slate-800">Pedidos Ecom</p>
                    <p className="text-xs text-slate-500">Formato CSV (.csv)</p>
                    {archivoEcom && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">{archivoEcom.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputEcomRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => setArchivoEcom(e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => inputEcomRef.current?.click()}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {archivoEcom ? "Cambiar archivo" : "Seleccionar archivo"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={handleProcesarDatosEcom}
                  disabled={!archivoEcom || isProcesandoEcom}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    !archivoEcom || isProcesandoEcom
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isProcesandoEcom ? "Procesando..." : "Procesar datos"}
                </button>
                <button
                  onClick={resetImportEcomState}
                  disabled={isProcesandoEcom}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Limpiar
                </button>
              </div>

              {isProcesandoEcom && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Procesando datos...</span>
                    <span className="font-semibold text-slate-700">{progresoImportEcom}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progresoImportEcom}%` }}
                    />
                  </div>
                </div>
              )}

              {errorImportEcom && (
                <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {errorImportEcom}
                </div>
              )}

              {resultadoImportEcom && (
                <div className="mt-6 space-y-2">
                  <div
                    className={`p-4 rounded-lg border text-sm ${
                      resultadoImportEcom.error
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700"
                    }`}
                  >
                    <span className="font-semibold">Pedidos Ecom:</span>{" "}
                    {resultadoImportEcom.error
                      ? resultadoImportEcom.error
                      : `${resultadoImportEcom.filasInsertadas} de ${resultadoImportEcom.filasLeidas} filas cargadas correctamente.`}
                  </div>
                </div>
              )}
            </div>
  );
}

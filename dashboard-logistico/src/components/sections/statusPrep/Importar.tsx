"use client";

import { useRef, useState } from "react";
import { parseCsvFile, parseExcelFile } from "@/lib/fileParsers";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import ActualizarAgenteBoton from "@/components/ActualizarAgenteBoton";
import AgenteTokenPanel from "@/components/AgenteTokenPanel";
import { enviarArchivoEnLotes, type ImportFileResult } from "@/lib/importMaestros";

export default function Importar() {
  const { setDataVersion, setActiveTab, tienePermiso } = useDashboard();

  const [archivoClientes, setArchivoClientes] = useState<File | null>(null);
  const [archivoGrupos, setArchivoGrupos] = useState<File | null>(null);
  const [archivoTiendas, setArchivoTiendas] = useState<File | null>(null);
  const [isProcesando, setIsProcesando] = useState(false);
  const [progresoImport, setProgresoImport] = useState(0); // 0-100
  const [resultadosImport, setResultadosImport] = useState<ImportFileResult[] | null>(null);
  const [errorImport, setErrorImport] = useState<string | null>(null);

  const inputClientesRef = useRef<HTMLInputElement>(null);
  const inputGruposRef = useRef<HTMLInputElement>(null);
  const inputTiendasRef = useRef<HTMLInputElement>(null);

  // Clientes es opcional: ya queda guardado en su propia tabla (upsert) de
  // una carga anterior, así que no hace falta volver a subirlo cada vez que
  // se actualizan Grupos/Tiendas -- esos dos sí son obligatorios.
  const todosLosArchivosListos = !!archivoGrupos && !!archivoTiendas;

  const handleProcesarDatos = async () => {
    if (!todosLosArchivosListos) return;

    setIsProcesando(true);
    setProgresoImport(0);
    setErrorImport(null);
    setResultadosImport(null);

    const archivos: { key: "clientes" | "grupos" | "tiendas"; file: File; tipo: "excel" | "csv" }[] = [
      ...(archivoClientes ? [{ key: "clientes" as const, file: archivoClientes, tipo: "excel" as const }] : []),
      { key: "grupos", file: archivoGrupos as File, tipo: "csv" },
      { key: "tiendas", file: archivoTiendas as File, tipo: "csv" },
    ];

    const resultados: ImportFileResult[] = [];

    try {
      // Parseamos los 3 archivos primero para saber el total de registros
      // y poder calcular un % de avance real sobre el conjunto completo.
      const archivosConRegistros = await Promise.all(
        archivos.map(async ({ key, file, tipo }) => {
          try {
            const records = tipo === "excel" ? await parseExcelFile(file) : await parseCsvFile(file);
            return { key, records, errorParseo: null as string | null };
          } catch (err) {
            return { key, records: [] as Record<string, unknown>[], errorParseo: err instanceof Error ? err.message : "Error al leer el archivo" };
          }
        })
      );

      const totalRegistros = archivosConRegistros.reduce((acc, a) => acc + a.records.length, 0) || 1;
      let registrosProcesados = 0;

      for (const { key, records, errorParseo } of archivosConRegistros) {
        if (errorParseo) {
          resultados.push({ archivo: key, filasLeidas: 0, filasInsertadas: 0, error: errorParseo });
          continue;
        }
        try {
          if (records.length === 0) {
            resultados.push({ archivo: key, filasLeidas: 0, filasInsertadas: 0, error: "El archivo no tiene filas de datos." });
            continue;
          }

          const { filasInsertadas } = await enviarArchivoEnLotes(key, records, (cantidad) => {
            registrosProcesados += cantidad;
            setProgresoImport(Math.min(100, Math.round((registrosProcesados / totalRegistros) * 100)));
          });
          resultados.push({ archivo: key, filasLeidas: records.length, filasInsertadas, error: null });
        } catch (err) {
          resultados.push({
            archivo: key,
            filasLeidas: 0,
            filasInsertadas: 0,
            error: err instanceof Error ? err.message : "Error desconocido",
          });
        }
      }

      setProgresoImport(100);
      setResultadosImport(resultados);

      // Si al menos un archivo se procesó sin error, refrescamos los datos
      // de Resumen / Por fecha / Por pedidos para que se vean al instante,
      // y llevamos la vista al Resumen de esta misma sección.
      if (resultados.some((r) => !r.error)) {
        setDataVersion((v) => v + 1);
        setTimeout(() => setActiveTab("Resumen"), 800);
      }
    } catch (err) {
      setErrorImport(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsProcesando(false);
    }
  };

  const resetImportState = () => {
    setArchivoClientes(null);
    setArchivoGrupos(null);
    setArchivoTiendas(null);
    setResultadosImport(null);
    setErrorImport(null);
    if (inputClientesRef.current) inputClientesRef.current.value = "";
    if (inputGruposRef.current) inputGruposRef.current.value = "";
    if (inputTiendasRef.current) inputTiendasRef.current.value = "";
  };

  return (
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-3xl">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Importar Maestros</h2>
              <p className="text-sm text-slate-500 mb-6">
                Grupos y Tiendas son obligatorios en cada carga. Clientes es opcional -- una vez importado
                queda guardado en su propia tabla, no hace falta volver a subirlo para actualizar Grupos/Tiendas.
              </p>

              {tienePermiso("NOECOM-ActualizarWMS") && (
                <>
                  <AgenteTokenPanel />
                  <ActualizarAgenteBoton seccion="no_ecom" onExito={() => setDataVersion((v) => v + 1)} />
                </>
              )}

              <div className="space-y-4 mt-6">
                {/* --- CLIENTES (Excel) --- */}
                <div className="flex items-center justify-between border border-slate-200 rounded-lg p-4">
                  <div>
                    <p className="font-semibold text-slate-800">Clientes <span className="font-normal text-slate-400">(opcional)</span></p>
                    <p className="text-xs text-slate-500">Formato Excel (.xlsx, .xls)</p>
                    {archivoClientes && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">{archivoClientes.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputClientesRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => setArchivoClientes(e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => inputClientesRef.current?.click()}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {archivoClientes ? "Cambiar archivo" : "Seleccionar archivo"}
                    </button>
                  </div>
                </div>

                {/* --- GRUPOS (CSV) --- */}
                <div className="flex items-center justify-between border border-slate-200 rounded-lg p-4">
                  <div>
                    <p className="font-semibold text-slate-800">Grupos</p>
                    <p className="text-xs text-slate-500">Formato CSV (.csv)</p>
                    {archivoGrupos && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">{archivoGrupos.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputGruposRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => setArchivoGrupos(e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => inputGruposRef.current?.click()}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {archivoGrupos ? "Cambiar archivo" : "Seleccionar archivo"}
                    </button>
                  </div>
                </div>

                {/* --- TIENDAS (CSV) --- */}
                <div className="flex items-center justify-between border border-slate-200 rounded-lg p-4">
                  <div>
                    <p className="font-semibold text-slate-800">Tiendas</p>
                    <p className="text-xs text-slate-500">Formato CSV (.csv)</p>
                    {archivoTiendas && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">{archivoTiendas.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputTiendasRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => setArchivoTiendas(e.target.files?.[0] ?? null)}
                    />
                    <button
                      onClick={() => inputTiendasRef.current?.click()}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {archivoTiendas ? "Cambiar archivo" : "Seleccionar archivo"}
                    </button>
                  </div>
                </div>
              </div>

              {/* --- ACCIONES --- */}
              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={handleProcesarDatos}
                  disabled={!todosLosArchivosListos || isProcesando}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    !todosLosArchivosListos || isProcesando
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isProcesando ? "Procesando..." : "Procesar datos"}
                </button>
                <button
                  onClick={resetImportState}
                  disabled={isProcesando}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Limpiar
                </button>
              </div>

              {/* --- BARRA DE PROGRESO --- */}
              {isProcesando && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Procesando datos...</span>
                    <span className="font-semibold text-slate-700">{progresoImport}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progresoImport}%` }}
                    />
                  </div>
                </div>
              )}

              {/* --- RESULTADOS --- */}
              {errorImport && (
                <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {errorImport}
                </div>
              )}

              {resultadosImport && (
                <div className="mt-6 space-y-2">
                  {resultadosImport.map((r) => (
                    <div
                      key={r.archivo}
                      className={`p-4 rounded-lg border text-sm ${
                        r.error
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-emerald-50 border-emerald-200 text-emerald-700"
                      }`}
                    >
                      <span className="font-semibold capitalize">{r.archivo}:</span>{" "}
                      {r.error
                        ? r.error
                        : `${r.filasInsertadas} de ${r.filasLeidas} filas cargadas correctamente.`}
                    </div>
                  ))}
                </div>
              )}
            </div>
  );
}

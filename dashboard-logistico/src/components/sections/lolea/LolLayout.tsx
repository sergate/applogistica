"use client";

import { useMemo, useRef, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum } from "@/components/dashboard/formatters";
import { parseCsvFile, parseExcelFile } from "@/lib/fileParsers";

interface PosicionFila {
  ubicacion: string;
  nave: string | null;
  articulos: { articulo: string; variante: string; unidad: string; cantidad: number }[];
}

interface LayoutData {
  posiciones: PosicionFila[];
}

type Resultado = { ok: boolean; texto: string } | null;

const claseSelect =
  "px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer";

// Layout de Lolea (solo admin): las posiciones propias del módulo, guardadas en
// la zona LOLEA de la tabla de layout del almacén. La importación del layout
// general no las toca, y esta zona queda fuera de Ocupación Almacén.
export default function LolLayout() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const { data, error, isLoading } = useTabData<LayoutData>(activeTab, "LOL-Layout", "/api/lolea/layout", dataVersion);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"TODAS" | "ocupadas" | "libres">("TODAS");

  const posiciones = useMemo(() => data?.posiciones ?? [], [data]);
  const ocupadas = posiciones.filter((p) => p.articulos.length > 0).length;

  const texto = busqueda.trim().toLowerCase();
  const filtradas = useMemo(
    () =>
      posiciones.filter((p) => {
        if (filtro === "ocupadas" && p.articulos.length === 0) return false;
        if (filtro === "libres" && p.articulos.length > 0) return false;
        if (!texto) return true;
        return (
          p.ubicacion.toLowerCase().includes(texto) ||
          p.articulos.some((a) => `${a.articulo} ${a.variante}`.toLowerCase().includes(texto))
        );
      }),
    [posiciones, filtro, texto]
  );

  const importar = async () => {
    if (!archivo) return;
    setImportando(true);
    setResultado(null);
    try {
      const esCsv = archivo.name.toLowerCase().endsWith(".csv");
      const registros = esCsv ? await parseCsvFile(archivo) : await parseExcelFile(archivo);
      if (registros.length === 0) throw new Error("El archivo no tiene filas de datos.");
      if (!registros.some((r) => r.ubicacion != null)) {
        throw new Error('El archivo necesita una columna "Ubicacion" (y, si querés, "Nave").');
      }

      const filas = registros.map((r) => ({
        ubicacion: r.ubicacion != null ? String(r.ubicacion) : "",
        nave: r.nave != null ? String(r.nave) : null,
      }));

      const res = await fetch("/api/lolea/layout/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || "No se pudo importar el layout.");

      setResultado({
        ok: true,
        texto: `Layout de Lolea cargado: ${fmtNum(json.total)} posiciones (${fmtNum(json.agregadas)} nuevas, ${fmtNum(json.eliminadas)} eliminadas).`,
      });
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = "";
      setDataVersion((v) => v + 1);
    } catch (err) {
      setResultado({ ok: false, texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Layout de Lolea</h2>
        <p className="text-sm text-slate-500 mb-4">
          Una fila por posición, con la columna <b>Ubicacion</b> (y, si querés, <b>Nave</b>). El archivo deja la zona
          LOLEA exactamente como está: las posiciones nuevas se agregan y las que ya no figuran se sacan, salvo que
          tengan stock. Una posición que ya existe en el almacén de Altatex se rechaza.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Seleccionar archivo
          </button>
          {archivo && <span className="text-sm text-emerald-600 font-medium">{archivo.name}</span>}
          <button
            onClick={importar}
            disabled={!archivo || importando}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              !archivo || importando
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {importando ? "Importando..." : "Importar layout de Lolea"}
          </button>
        </div>

        {resultado && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm border ${
              resultado.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {resultado.texto}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Stock por posición</h2>

        <div className="grid grid-cols-3 gap-3 mb-5 max-w-xl">
          {[
            { n: fmtNum(posiciones.length), t: "Posiciones definidas" },
            { n: fmtNum(ocupadas), t: "Ocupadas" },
            { n: fmtNum(posiciones.length - ocupadas), t: "Libres" },
          ].map((k) => (
            <div key={k.t} className="border border-slate-200 rounded-lg px-4 py-3">
              <div className="text-2xl font-bold text-slate-900">{k.n}</div>
              <div className="text-xs text-slate-500">{k.t}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as "TODAS" | "ocupadas" | "libres")}
            aria-label="Filtrar posiciones"
            className={claseSelect}
          >
            <option value="TODAS">Todas las posiciones</option>
            <option value="ocupadas">Solo ocupadas</option>
            <option value="libres">Solo libres</option>
          </select>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar posición o artículo..."
            aria-label="Buscar posición o artículo"
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          {(busqueda !== "" || filtro !== "TODAS") && (
            <button
              onClick={() => {
                setBusqueda("");
                setFiltro("TODAS");
              }}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            Error al cargar: {error}
          </div>
        )}
        {isLoading && !data && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
            <SkeletonTable rows={6} columns={4} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Posición</th>
                <th className="py-3 px-4 text-left">Nave</th>
                <th className="py-3 px-4 text-left">Artículo</th>
                <th className="py-3 px-4 text-left">Variante</th>
                <th className="py-3 px-4 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.flatMap((p) =>
                p.articulos.length === 0
                  ? [
                      <tr key={p.ubicacion} className="hover:bg-slate-50">
                        <td className="py-2 px-4 text-left font-mono font-bold text-slate-900">{p.ubicacion}</td>
                        <td className="py-2 px-4 text-left text-slate-600">{p.nave ?? ""}</td>
                        <td colSpan={3} className="py-2 px-4 text-left text-slate-400">
                          Libre
                        </td>
                      </tr>,
                    ]
                  : p.articulos.map((a, i) => (
                      <tr key={`${p.ubicacion}-${i}`} className="hover:bg-slate-50">
                        <td className="py-2 px-4 text-left font-mono font-bold text-slate-900">{i === 0 ? p.ubicacion : ""}</td>
                        <td className="py-2 px-4 text-left text-slate-600">{i === 0 ? p.nave ?? "" : ""}</td>
                        <td className="py-2 px-4 text-left text-slate-800 font-medium">{a.articulo}</td>
                        <td className="py-2 px-4 text-left text-slate-700">{a.variante}</td>
                        <td className="py-2 px-4 text-right font-semibold text-slate-900">
                          {fmtNum(a.cantidad)} <span className="text-xs font-normal text-slate-400">{a.unidad.toLowerCase()}</span>
                        </td>
                      </tr>
                    ))
              )}
            </tbody>
          </table>
          {filtradas.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">
              {posiciones.length === 0
                ? "Todavía no cargaste el layout de Lolea: importá el archivo de posiciones."
                : "No hay posiciones con estos filtros."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

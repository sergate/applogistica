"use client";

import { useMemo, useRef, useState } from "react";
import type * as XLSXType from "xlsx";

// Decodifica entidades HTML (&aacute;, &Ntilde;, etc.) que vienen literales
// en las celdas del Excel exportado por el WMS.
function decodeHtmlEntities(str: string): string {
  if (typeof document === "undefined") return str;
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

// Saca acentos y normaliza a snake_case para poder matchear encabezados
// aunque vengan con entidades HTML o mayúsculas distintas.
const COMBINING_MARKS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeHeader(header: string): string {
  return decodeHtmlEntities(header)
    .normalize("NFD")
    .replace(COMBINING_MARKS_RE, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface FilaContenedor {
  contenedor: string;
  nroMaster: string;
  cliente: string;
  numeroLocal: string;
  curva: string;
  ubicacion: string;
}

interface ResultadoBusqueda {
  pedidoWms: string;
  encontrado: boolean;
  fila: FilaContenedor | null;
}

const COLUMNAS_REQUERIDAS: Record<string, string> = {
  numero: "numero",
  pedido_gaci: "pedido_gaci",
  nro_master: "nro_master",
  cliente: "cliente",
  curva: "curva",
  ubicacion: "ubicacion",
};

export default function PedidosWmsPage() {
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [indice, setIndice] = useState<Map<string, FilaContenedor[]> | null>(null);
  const [totalFilas, setTotalFilas] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pedidosTexto, setPedidosTexto] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null);
  const inputFileRef = useRef<HTMLInputElement>(null);

  const handleArchivo = async (file: File) => {
    setCargando(true);
    setError(null);
    setResultados(null);
    try {
      const XLSX: typeof XLSXType = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      if (filas.length < 2) {
        throw new Error("El archivo no tiene filas de datos.");
      }

      const encabezados = (filas[0] as string[]).map((h) => normalizeHeader(String(h)));
      const idx: Record<string, number> = {};
      for (const clave of Object.keys(COLUMNAS_REQUERIDAS)) {
        const pos = encabezados.indexOf(clave);
        if (pos === -1) {
          throw new Error(`No se encontró la columna "${clave}" en el archivo.`);
        }
        idx[clave] = pos;
      }

      // Un mismo pedido WMS puede estar repartido en varios contenedores,
      // así que se guardan todas las coincidencias, no solo la última.
      const mapa = new Map<string, FilaContenedor[]>();
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i];
        const pedidoWms = String(fila[idx.pedido_gaci] ?? "").trim();
        if (!pedidoWms) continue;

        const clienteCrudo = decodeHtmlEntities(String(fila[idx.cliente] ?? "")).trim();
        const match = clienteCrudo.match(/^(\d+)\s*-\s*(.*)$/);
        const numeroLocal = match ? match[1].trim() : "";
        const clienteTexto = match ? match[2].trim() : clienteCrudo;

        const clave = pedidoWms.toUpperCase();
        const filaContenedor: FilaContenedor = {
          contenedor: String(fila[idx.numero] ?? "").trim(),
          nroMaster: String(fila[idx.nro_master] ?? "").trim(),
          cliente: clienteTexto,
          numeroLocal,
          curva: String(fila[idx.curva] ?? "").trim(),
          ubicacion: decodeHtmlEntities(String(fila[idx.ubicacion] ?? "")).trim(),
        };
        const existentes = mapa.get(clave);
        if (existentes) existentes.push(filaContenedor);
        else mapa.set(clave, [filaContenedor]);
      }

      setIndice(mapa);
      setNombreArchivo(file.name);
      setTotalFilas(filas.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar el archivo.");
      setIndice(null);
      setNombreArchivo(null);
    } finally {
      setCargando(false);
    }
  };

  const pedidosLista = useMemo(() => {
    return Array.from(
      new Set(
        pedidosTexto
          .split(/[\n,;\s]+/)
          .map((p) => p.trim())
          .filter(Boolean)
      )
    );
  }, [pedidosTexto]);

  const buscar = () => {
    if (!indice) return;
    const res: ResultadoBusqueda[] = [];
    for (const pedido of pedidosLista) {
      const coincidencias = indice.get(pedido.toUpperCase());
      if (coincidencias && coincidencias.length > 0) {
        for (const fila of coincidencias) {
          res.push({ pedidoWms: pedido, encontrado: true, fila });
        }
      } else {
        res.push({ pedidoWms: pedido, encontrado: false, fila: null });
      }
    }
    res.sort((a, b) => a.pedidoWms.localeCompare(b.pedidoWms, "es", { numeric: true, sensitivity: "base" }));
    setResultados(res);
  };

  const pedidosEncontrados = useMemo(() => {
    if (!resultados) return 0;
    return new Set(resultados.filter((r) => r.encontrado).map((r) => r.pedidoWms)).size;
  }, [resultados]);

  const descargarExcel = async () => {
    if (!resultados || resultados.length === 0) return;
    const XLSX: typeof XLSXType = await import("xlsx");
    const datos = resultados.map((r) =>
      r.fila
        ? {
            "Pedido WMS": r.pedidoWms,
            Contenedor: r.fila.contenedor,
            "Nro.master": r.fila.nroMaster,
            Cliente: r.fila.cliente,
            "Numero Local": r.fila.numeroLocal,
            Curva: r.fila.curva,
            Ubicacion: r.fila.ubicacion,
          }
        : {
            "Pedido WMS": r.pedidoWms,
            Contenedor: "No encontrado",
            "Nro.master": "",
            Cliente: "",
            "Numero Local": "",
            Curva: "",
            Ubicacion: "",
          }
    );
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos WMS");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `pedidos-wms-${fecha}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Buscador de pedidos WMS en contenedores</h1>
          <p className="text-sm text-slate-500 mt-1">
            Subí el archivo de contenedores y pegá uno o varios pedidos WMS para ver en qué contenedor está cada uno.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <label className="block text-sm font-medium text-slate-600 mb-2">Archivo de contenedores (.xlsx)</label>
          <div className="flex items-center gap-3">
            <input
              ref={inputFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleArchivo(file);
              }}
              className="block text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {cargando && <p className="text-sm text-slate-500 mt-3">Procesando archivo...</p>}
          {error && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
          {indice && !cargando && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
              Archivo <span className="font-semibold">{nombreArchivo}</span> cargado — {totalFilas} filas indexadas.
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <label className="block text-sm font-medium text-slate-600 mb-2">
            Pedidos WMS (uno por línea, o separados por coma/espacio)
          </label>
          <textarea
            value={pedidosTexto}
            onChange={(e) => setPedidosTexto(e.target.value)}
            rows={6}
            placeholder={"WMS000098817\nWMS000100261"}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-slate-400">{pedidosLista.length} pedido(s) para buscar</span>
            <button
              type="button"
              disabled={!indice || pedidosLista.length === 0}
              onClick={buscar}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                !indice || pedidosLista.length === 0
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              Buscar
            </button>
          </div>
        </div>

        {resultados && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-700">Resultados</h2>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-400">
                  {pedidosEncontrados} de {pedidosLista.length} pedido(s) encontrados ({resultados.length} fila(s))
                </span>
                <button
                  type="button"
                  onClick={descargarExcel}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Descargar Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-4 font-medium">Pedido WMS</th>
                    <th className="py-2 pr-4 font-medium">Contenedor</th>
                    <th className="py-2 pr-4 font-medium">Nro.master</th>
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 font-medium">Número Local</th>
                    <th className="py-2 pr-4 font-medium">Curva</th>
                    <th className="py-2 pr-4 font-medium">Ubicación</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, i) => (
                    <tr key={`${r.pedidoWms}-${i}`} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 font-mono text-slate-700">{r.pedidoWms}</td>
                      {r.fila ? (
                        <>
                          <td className="py-2 pr-4 text-slate-700">{r.fila.contenedor}</td>
                          <td className="py-2 pr-4 text-slate-700">{r.fila.nroMaster}</td>
                          <td className="py-2 pr-4 text-slate-700">{r.fila.cliente}</td>
                          <td className="py-2 pr-4 text-slate-700">{r.fila.numeroLocal}</td>
                          <td className="py-2 pr-4 text-slate-700">{r.fila.curva}</td>
                          <td className="py-2 pr-4 text-slate-700">{r.fila.ubicacion}</td>
                        </>
                      ) : (
                        <td colSpan={6} className="py-2 pr-4 text-red-500">
                          No encontrado en el archivo
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

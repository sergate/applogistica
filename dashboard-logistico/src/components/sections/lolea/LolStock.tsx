"use client";

import { Fragment, useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum } from "@/components/dashboard/formatters";
import { estadoDeStock, type EstadoStock } from "@/lib/lolea";

interface SkuFila {
  id: number;
  grupo: string;
  articulo: string;
  variante: string;
  unidad: string;
  seguridad: number;
  stage: number;
  enPosiciones: number;
  reservado: number;
}

interface StockData {
  skus: SkuFila[];
}

const PASTILLA: Record<EstadoStock, { texto: string; clase: string }> = {
  sin_stock: { texto: "Sin stock", clase: "bg-slate-100 text-slate-500" },
  bajo_minimo: { texto: "Bajo mínimo", clase: "bg-red-100 text-red-700" },
  en_el_minimo: { texto: "En el mínimo", clase: "bg-amber-100 text-amber-700" },
  ok: { texto: "OK", clase: "bg-emerald-100 text-emerald-700" },
};

// Color de la celda del artículo por grupo, igual que en el Excel del maestro.
const COLOR_GRUPO: Record<string, string> = {
  "Contenedores 25 oz": "bg-green-100",
  "Contenedores 50 oz": "bg-cyan-100",
  Botellas: "bg-amber-50",
  Vasos: "bg-purple-100",
  "Bolsas y papel": "bg-pink-100",
};

const fisico = (s: SkuFila) => s.stage + s.enPosiciones;
const disponible = (s: SkuFila) => fisico(s) - s.reservado;

export default function LolStock() {
  const { activeTab, dataVersion } = useDashboard();

  const { data, error, isLoading } = useTabData<StockData>(activeTab, "LOL-Stock", "/api/lolea/stock", dataVersion);

  const [busqueda, setBusqueda] = useState("");
  const [soloReposicion, setSoloReposicion] = useState(false);

  const skus = useMemo(() => data?.skus ?? [], [data]);

  const kpis = useMemo(() => {
    const cuenta = (e: EstadoStock) => skus.filter((s) => estadoDeStock(disponible(s), s.seguridad) === e).length;
    return {
      articulos: skus.length,
      bajoMinimo: cuenta("bajo_minimo"),
      enElMinimo: cuenta("en_el_minimo"),
      sinStock: cuenta("sin_stock"),
      enStage: skus.reduce((acc, s) => acc + s.stage, 0),
    };
  }, [skus]);

  const texto = busqueda.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      skus.filter((s) => {
        if (soloReposicion && estadoDeStock(disponible(s), s.seguridad) === "ok") return false;
        return !texto || `${s.articulo} ${s.variante}`.toLowerCase().includes(texto);
      }),
    [skus, texto, soloReposicion]
  );

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const filas = filtrados.map((s) => ({
      Grupo: s.grupo,
      Artículo: s.articulo,
      Variante: s.variante,
      Unidad: s.unidad,
      "En stage": s.stage,
      "En posiciones": s.enPosiciones,
      Físico: fisico(s),
      Reservado: s.reservado,
      Disponible: disponible(s),
      "Stock de seguridad": s.seguridad,
      Estado: PASTILLA[estadoDeStock(disponible(s), s.seguridad)].texto,
    }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Stock Lolea");
    XLSX.writeFile(libro, `lolea_stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Stock actual de Lolea</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Físico = en stage + en posiciones. Disponible = físico menos lo reservado por pedidos planificados.
            </p>
          </div>
          <button
            onClick={exportarExcel}
            disabled={filtrados.length === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtrados.length === 0
                ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Exportar a Excel
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 my-5">
          {[
            { n: fmtNum(kpis.articulos), t: "Artículos activos" },
            { n: fmtNum(kpis.bajoMinimo), t: "Bajo mínimo" },
            { n: fmtNum(kpis.enElMinimo), t: "En el mínimo" },
            { n: fmtNum(kpis.sinStock), t: "Sin stock" },
            { n: fmtNum(kpis.enStage), t: "Unidades en stage" },
          ].map((k) => (
            <div key={k.t} className="border border-slate-200 rounded-lg px-4 py-3">
              <div className="text-2xl font-bold text-slate-900 whitespace-nowrap">{k.n}</div>
              <div className="text-xs text-slate-500">{k.t}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar artículo o variante..."
            aria-label="Buscar artículo o variante"
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={soloReposicion}
              onChange={(e) => setSoloReposicion(e.target.checked)}
              className="rounded border-slate-300"
            />
            Solo lo que necesita reposición
          </label>
          {(busqueda !== "" || soloReposicion) && (
            <button
              onClick={() => {
                setBusqueda("");
                setSoloReposicion(false);
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
            <SkeletonTable rows={8} columns={9} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Artículo</th>
                <th className="py-3 px-4 text-left">Variante</th>
                <th className="py-3 px-4 text-left">Unidad</th>
                <th className="py-3 px-4 text-right">En stage</th>
                <th className="py-3 px-4 text-right">En posiciones</th>
                <th className="py-3 px-4 text-right">Físico</th>
                <th className="py-3 px-4 text-right">Reservado</th>
                <th className="py-3 px-4 text-right">Disponible</th>
                <th className="py-3 px-4 text-right">Seguridad</th>
                <th className="py-3 px-4 text-left">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((s, i) => {
                const estado = PASTILLA[estadoDeStock(disponible(s), s.seguridad)];
                const nuevoGrupo = i === 0 || filtrados[i - 1].grupo !== s.grupo;
                return (
                  <Fragment key={s.id}>
                    {nuevoGrupo && (
                      <tr className="bg-slate-50">
                        <td colSpan={10} className="py-1.5 px-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {s.grupo}
                        </td>
                      </tr>
                    )}
                    <tr className="hover:bg-slate-50">
                      <td className={`py-2.5 px-4 text-left font-medium text-slate-900 ${COLOR_GRUPO[s.grupo] ?? ""}`}>
                        {s.articulo}
                      </td>
                      <td className="py-2.5 px-4 text-left text-slate-700">{s.variante}</td>
                      <td className="py-2.5 px-4 text-left text-slate-600">{s.unidad}</td>
                      <td className="py-2.5 px-4 text-right text-slate-700">{fmtNum(s.stage)}</td>
                      <td className="py-2.5 px-4 text-right text-slate-700">{fmtNum(s.enPosiciones)}</td>
                      <td className="py-2.5 px-4 text-right text-slate-700">{fmtNum(fisico(s))}</td>
                      <td className="py-2.5 px-4 text-right text-slate-500">{s.reservado ? fmtNum(s.reservado) : "—"}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">{fmtNum(disponible(s))}</td>
                      <td className="py-2.5 px-4 text-right text-slate-500">{fmtNum(s.seguridad)}</td>
                      <td className="py-2.5 px-4 text-left">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${estado.clase}`}>{estado.texto}</span>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {filtrados.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">
              {skus.length === 0
                ? "Todavía no hay artículos cargados. Corré el SQL lolea.sql en Supabase."
                : "No hay artículos con estos filtros."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

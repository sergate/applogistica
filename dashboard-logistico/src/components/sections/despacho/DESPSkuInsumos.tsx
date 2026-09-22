"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";

interface InsumoSku {
  sku: string;
  descripcion: string | null;
  creado_en: string;
  creado_por_nombre: string | null;
}

export default function DESPSkuInsumos() {
  const { activeTab } = useDashboard();

  const [insumosSkus, setInsumosSkus] = useState<InsumoSku[] | null>(null);
  const [insumosSkusError, setInsumosSkusError] = useState<string | null>(null);
  const [insumosSkusCargando, setInsumosSkusCargando] = useState(false);
  const [nuevoSkuInsumo, setNuevoSkuInsumo] = useState("");
  const [nuevaDescripcionSkuInsumo, setNuevaDescripcionSkuInsumo] = useState("");
  const [agregandoSkuInsumo, setAgregandoSkuInsumo] = useState(false);

  const cargarInsumosSkus = async () => {
    setInsumosSkusCargando(true);
    setInsumosSkusError(null);
    try {
      const res = await fetch("/api/despacho/insumos-skus", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los SKU.");
      setInsumosSkus(data.items);
    } catch (err) {
      setInsumosSkusError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setInsumosSkusCargando(false);
    }
  };

  useEffect(() => {
    if (activeTab === "DESP-SkuInsumos" && insumosSkus === null) cargarInsumosSkus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const agregarSkuInsumo = async () => {
    const sku = nuevoSkuInsumo.trim();
    if (!sku) return;
    setAgregandoSkuInsumo(true);
    setInsumosSkusError(null);
    try {
      const res = await fetch("/api/despacho/insumos-skus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, descripcion: nuevaDescripcionSkuInsumo.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo agregar el SKU.");
      setNuevoSkuInsumo("");
      setNuevaDescripcionSkuInsumo("");
      await cargarInsumosSkus();
    } catch (err) {
      setInsumosSkusError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoSkuInsumo(false);
    }
  };

  const quitarSkuInsumo = async (sku: string) => {
    setInsumosSkusError(null);
    try {
      const res = await fetch(`/api/despacho/insumos-skus?sku=${encodeURIComponent(sku)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo quitar el SKU.");
      await cargarInsumosSkus();
    } catch (err) {
      setInsumosSkusError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-2xl">
      <h2 className="text-lg font-bold text-slate-800 mb-1">SKU de Insumos</h2>
      <p className="text-sm text-slate-500 mb-4">
        SKU catalogados como insumo (no producto). Se usan para clasificar, en el packing list de cada guía
        Propio, qué cajas son 100% insumo -- si una caja tiene aunque sea un SKU que no está acá, se cuenta
        como producto.
      </p>

      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">SKU</label>
          <input
            type="text"
            value={nuevoSkuInsumo}
            onChange={(e) => setNuevoSkuInsumo(e.target.value)}
            placeholder="Ej: V25LM001%018"
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-52"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Descripción (opcional)</label>
          <input
            type="text"
            value={nuevaDescripcionSkuInsumo}
            onChange={(e) => setNuevaDescripcionSkuInsumo(e.target.value)}
            placeholder="Ej: BOLSA CHK FRIS GDE INST"
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
        <button
          onClick={agregarSkuInsumo}
          disabled={agregandoSkuInsumo || !nuevoSkuInsumo.trim()}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            agregandoSkuInsumo || !nuevoSkuInsumo.trim()
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {agregandoSkuInsumo ? "Agregando..." : "Agregar"}
        </button>
      </div>

      {insumosSkusError && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {insumosSkusError}
        </div>
      )}
      {insumosSkusCargando && insumosSkus === null && <p className="text-sm text-slate-400">Cargando...</p>}

      {insumosSkus && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-2 px-3 text-left">SKU</th>
                <th className="py-2 px-3 text-left">Descripción</th>
                <th className="py-2 px-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {insumosSkus.map((it) => (
                <tr key={it.sku}>
                  <td className="py-2 px-3 text-left font-medium text-slate-700">{it.sku}</td>
                  <td className="py-2 px-3 text-left text-slate-600">{it.descripcion || "—"}</td>
                  <td className="py-2 px-3 text-left">
                    <button
                      onClick={() => quitarSkuInsumo(it.sku)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {insumosSkus.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">Todavía no agregaste ningún SKU.</p>
          )}
          <p className="text-xs text-slate-400 mt-3">{insumosSkus.length} SKU cargados.</p>
        </div>
      )}
    </div>
  );
}

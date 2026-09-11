"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface InterlocalDetalle {
  numero_movimiento: string;
  local_origen_codigo: string;
  local_origen_nombre: string | null;
  local_destino_codigo: string;
  local_destino_nombre: string | null;
  marca: string | null;
  cantidad_bultos: number;
  observaciones: string | null;
}

interface DespachoDetalle {
  guia: string | null;
  numero_guia: string | null;
  cliente: string | null;
  tipo: string | null;
  cajas: number | null;
  bultos_insumos: number | null;
  bultos_producto: number | null;
}

// Bultos insumo/producto de una guía de despacho para la impresión: si no
// se calculó (guías que no son Propio, o Propio sin packing list) se
// cuentan los bultos enteros como producto en vez de dejarlos sin sumar.
function bultosDespacho(d: DespachoDetalle | null) {
  if (!d) return { insumos: 0, producto: 0 };
  if (d.bultos_insumos == null) return { insumos: 0, producto: d.cajas ?? 0 };
  return { insumos: d.bultos_insumos, producto: d.bultos_producto ?? 0 };
}

interface ItemFila {
  id: number;
  tipo: "interlocal" | "despacho";
  referencia_id: number;
  orden: number;
  detalle: InterlocalDetalle | DespachoDetalle | null;
}

interface HojaDeRuta {
  id: number;
  fecha: string;
  local_codigo: string;
  local_nombre: string | null;
}

export default function ImprimirHojaDeRutaPage() {
  const params = useParams<{ id: string }>();
  const [hoja, setHoja] = useState<HojaDeRuta | null>(null);
  const [items, setItems] = useState<ItemFila[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/hoja-ruta/${params.id}`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar la hoja de ruta.");
        setHoja(data.hoja);
        setItems(data.items || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado.");
      } finally {
        setCargando(false);
      }
    })();
  }, [params.id]);

  const imprimir = async () => {
    try {
      await fetch(`/api/hoja-ruta/${params.id}/imprimir`, { method: "POST" });
    } catch {
      // Si falla marcar como impresa igual dejamos que el usuario imprima --
      // no queremos bloquear la operación por un error de red al confirmar.
    }
    window.print();
  };

  if (cargando) return <div className="p-8 text-slate-500 text-sm">Cargando...</div>;
  if (error) return <div className="p-8 text-red-600 text-sm">{error}</div>;
  if (!hoja) return null;

  const subtotalProducto = items.reduce((acc, it) => {
    if (it.tipo === "interlocal") return acc + ((it.detalle as InterlocalDetalle | null)?.cantidad_bultos ?? 1);
    return acc + bultosDespacho(it.detalle as DespachoDetalle | null).producto;
  }, 0);
  const subtotalInsumos = items.reduce((acc, it) => {
    if (it.tipo === "interlocal") return acc;
    return acc + bultosDespacho(it.detalle as DespachoDetalle | null).insumos;
  }, 0);

  return (
    <div className="max-w-4xl mx-auto p-8 print:p-0">
      {/* Sin esto el navegador imprime su propio encabezado/pie con el
          título de la pestaña y la URL de la página. */}
      <style>{"@page { margin: 0; }"}</style>
      <div className="flex items-center justify-between mb-6 print:hidden">
        <h1 className="text-xl font-bold text-slate-800">Hoja de Ruta #{hoja.id}</h1>
        <button
          onClick={imprimir}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
        >
          Imprimir
        </button>
      </div>

      <div className="border-2 border-slate-800 p-6 print:border-black">
        <div className="text-center mb-4">
          <p className="text-xs font-semibold tracking-wide">GRUPO ALTATEX</p>
          <p className="text-2xl font-bold">HOJA DE RUTA</p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-6 border-t border-b border-slate-400 py-3">
          <p><span className="font-semibold">Local destino:</span> {hoja.local_codigo} — {hoja.local_nombre || "—"}</p>
          <p><span className="font-semibold">Fecha:</span> {hoja.fecha}</p>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left">
              <th className="py-2 pr-2">Tipo</th>
              <th className="py-2 pr-2">Origen</th>
              <th className="py-2 pr-2">Destino</th>
              <th className="py-2 pr-2">Referencia</th>
              <th className="py-2 pr-2 text-right whitespace-nowrap">Bultos Producto</th>
              <th className="py-2 pr-2 text-right whitespace-nowrap">Bultos Insumos</th>
              <th className="py-2">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              if (it.tipo === "interlocal") {
                const d = it.detalle as InterlocalDetalle | null;
                return (
                  <tr key={it.id} className="border-b border-slate-300">
                    <td className="py-2 pr-2">Interlocal</td>
                    <td className="py-2 pr-2">{d ? `${d.local_origen_codigo} — ${d.local_origen_nombre || "—"}` : "—"}</td>
                    <td className="py-2 pr-2">{d ? `${d.local_destino_codigo} — ${d.local_destino_nombre || "—"}` : "—"}</td>
                    <td className="py-2 pr-2">Mov. {d?.numero_movimiento || "—"}</td>
                    <td className="py-2 pr-2 text-right">{d?.cantidad_bultos ?? 1}</td>
                    <td className="py-2 pr-2 text-right">—</td>
                    <td className="py-2">{d?.observaciones || "—"}</td>
                  </tr>
                );
              }
              const d = it.detalle as DespachoDetalle | null;
              const { insumos, producto } = bultosDespacho(d);
              return (
                <tr key={it.id} className="border-b border-slate-300">
                  <td className="py-2 pr-2">Despacho</td>
                  <td className="py-2 pr-2">CD</td>
                  <td className="py-2 pr-2">{d?.cliente || "—"}</td>
                  <td className="py-2 pr-2">{d?.numero_guia || d?.guia || "—"}</td>
                  <td className="py-2 pr-2 text-right">{producto}</td>
                  <td className="py-2 pr-2 text-right">{insumos || "—"}</td>
                  <td className="py-2">—</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-800 font-semibold">
              <td className="py-2 pr-2" colSpan={4}>
                Subtotal
              </td>
              <td className="py-2 pr-2 text-right">{subtotalProducto}</td>
              <td className="py-2 pr-2 text-right">{subtotalInsumos}</td>
              <td className="py-2"></td>
            </tr>
            <tr className="border-t border-slate-400 font-bold">
              <td className="py-2 pr-2" colSpan={4}>
                Total bultos
              </td>
              <td className="py-2 pr-2 text-right" colSpan={2}>
                {subtotalProducto + subtotalInsumos}
              </td>
              <td className="py-2"></td>
            </tr>
          </tfoot>
        </table>

        <div className="grid grid-cols-2 gap-8 mt-10 pt-6 text-sm">
          <div>
            <p className="border-t border-slate-800 pt-1">Firma responsable expedición</p>
          </div>
          <div>
            <p className="border-t border-slate-800 pt-1">Firma transportista</p>
          </div>
        </div>
      </div>
    </div>
  );
}

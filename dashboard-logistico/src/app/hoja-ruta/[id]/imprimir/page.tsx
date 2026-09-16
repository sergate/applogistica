"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import JsBarcode from "jsbarcode";

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
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!hoja || !barcodeRef.current) return;
    JsBarcode(barcodeRef.current, `HDR-${hoja.id}`, {
      format: "CODE128",
      displayValue: true,
      fontSize: 14,
      height: 40,
      margin: 4,
    });
  }, [hoja]);

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
    if (guiasSinPackingList.length > 0) return;
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

  // Guías Propio cuyo packing list todavía no se procesó (el import trae la
  // cabecera de la guía en segundos, pero el desglose por caja/SKU tarda
  // bastante más porque consulta el WMS bulto por bulto) -- mientras tanto
  // bultosDespacho() cuenta todos sus bultos como "Producto" sin poder
  // desglosar los insumos, así que avisamos antes de imprimir con ese dato
  // incompleto.
  const guiasSinPackingList = items
    .filter((it) => it.tipo === "despacho")
    .map((it) => it.detalle as DespachoDetalle | null)
    .filter((d): d is DespachoDetalle => !!d && (d.tipo || "").trim().toUpperCase() === "PROPIO" && d.bultos_insumos == null);

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
          disabled={guiasSinPackingList.length > 0}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          Imprimir
        </button>
      </div>

      {guiasSinPackingList.length > 0 && (
        <div className="print:hidden mb-6 rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">Impresión bloqueada: packing list sin procesar todavía</p>
          <p>
            La guía {guiasSinPackingList.map((d) => d.numero_guia || d.guia || "?").join(", ")} todavía no tiene el
            desglose de insumos calculado -- por ahora sus bultos figurarían todos como &quot;Producto&quot;. Esperá
            unos minutos a que el Agente termine de procesar el packing list y volvé a entrar a esta pantalla.
          </p>
        </div>
      )}

      <div className="border-2 border-slate-800 p-6 print:border-black">
        <div className="text-center mb-4">
          <p className="text-xs font-semibold tracking-wide">GRUPO ALTATEX</p>
          <p className="text-2xl font-bold">HOJA DE RUTA</p>
          <svg ref={barcodeRef} className="mx-auto mt-2" />
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-6 border-t border-b border-slate-400 py-3">
          <p><span className="font-semibold">Local destino:</span> {hoja.local_codigo} — {hoja.local_nombre || "—"}</p>
          <p><span className="font-semibold">Fecha:</span> {hoja.fecha}</p>
        </div>

        <table className="w-full text-sm border-collapse border border-slate-800">
          <thead>
            <tr className="text-left">
              <th className="py-2 px-2 border border-slate-800">Tipo</th>
              <th className="py-2 px-2 border border-slate-800">Origen</th>
              <th className="py-2 px-2 border border-slate-800">Destino</th>
              <th className="py-2 px-2 border border-slate-800">Referencia</th>
              <th className="py-2 px-2 border border-slate-800 text-center whitespace-nowrap">Producto</th>
              <th className="py-2 px-2 border border-slate-800 text-center whitespace-nowrap">Insumos</th>
              <th className="py-2 px-2 border border-slate-800 text-center">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              if (it.tipo === "interlocal") {
                const d = it.detalle as InterlocalDetalle | null;
                return (
                  <tr key={it.id}>
                    <td className="py-2 px-2 border border-slate-800">Interlocal</td>
                    <td className="py-2 px-2 border border-slate-800">{d ? `${d.local_origen_codigo} — ${d.local_origen_nombre || "—"}` : "—"}</td>
                    <td className="py-2 px-2 border border-slate-800">{d ? `${d.local_destino_codigo} — ${d.local_destino_nombre || "—"}` : "—"}</td>
                    <td className="py-2 px-2 border border-slate-800">Mov. {d?.numero_movimiento || "—"}</td>
                    <td className="py-2 px-2 border border-slate-800 text-center">{d?.cantidad_bultos ?? 1}</td>
                    <td className="py-2 px-2 border border-slate-800 text-center">—</td>
                    <td className="py-2 px-2 border border-slate-800 text-center">{d?.observaciones || "—"}</td>
                  </tr>
                );
              }
              const d = it.detalle as DespachoDetalle | null;
              const { insumos, producto } = bultosDespacho(d);
              return (
                <tr key={it.id}>
                  <td className="py-2 px-2 border border-slate-800">Despacho</td>
                  <td className="py-2 px-2 border border-slate-800">CD</td>
                  <td className="py-2 px-2 border border-slate-800">{d?.cliente || "—"}</td>
                  <td className="py-2 px-2 border border-slate-800">{d?.numero_guia || d?.guia || "—"}</td>
                  <td className="py-2 px-2 border border-slate-800 text-center">{producto}</td>
                  <td className="py-2 px-2 border border-slate-800 text-center">{insumos || "—"}</td>
                  <td className="py-2 px-2 border border-slate-800 text-center">—</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-2 px-2 border border-slate-800" colSpan={4}>
                Subtotal
              </td>
              <td className="py-2 px-2 border border-slate-800 text-center">{subtotalProducto}</td>
              <td className="py-2 px-2 border border-slate-800 text-center">{subtotalInsumos}</td>
              <td className="py-2 px-2 border border-slate-800"></td>
            </tr>
            <tr className="font-bold">
              <td className="py-2 px-2 border border-slate-800" colSpan={4}>
                Total bultos
              </td>
              <td className="py-2 px-2 border border-slate-800 text-center" colSpan={2}>
                {subtotalProducto + subtotalInsumos}
              </td>
              <td className="py-2 px-2 border border-slate-800"></td>
            </tr>
            <tr>
              <td className="py-2 px-2 border border-slate-800" colSpan={7}>
                Devolución Local: a retirar <span className="inline-block w-20 border-b border-slate-800">&nbsp;</span> bultos
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="grid grid-cols-3 gap-8 mt-10 pt-6 text-sm">
          <div>
            <p className="border-t border-slate-800 pt-1">Firma responsable expedición</p>
          </div>
          <div>
            <p className="border-t border-slate-800 pt-1">Firma transportista</p>
          </div>
          <div>
            <p className="border-t border-slate-800 pt-1">Firma responsable local/cliente</p>
          </div>
        </div>
      </div>
    </div>
  );
}

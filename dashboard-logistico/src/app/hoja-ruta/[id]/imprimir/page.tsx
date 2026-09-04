"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface InterlocalDetalle {
  numero_movimiento: string;
  numero_remito: string | null;
  local_origen_codigo: string;
  local_origen_nombre: string | null;
  local_destino_codigo: string;
  local_destino_nombre: string | null;
  domicilio_entrega: string | null;
  marca: string | null;
}

interface DespachoDetalle {
  guia: string | null;
  numero_guia: string | null;
  numero_comprobante: string | null;
  cliente: string | null;
  tipo: string | null;
  cajas: number | null;
  unidades: number | null;
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
  transporte: string | null;
  patente: string | null;
  chofer: string | null;
  estado: string;
  impresa_en: string | null;
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

  return (
    <div className="max-w-4xl mx-auto p-8 print:p-0">
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
          <p><span className="font-semibold">Transporte:</span> {hoja.transporte || "—"}</p>
          <p><span className="font-semibold">Patente:</span> {hoja.patente || "—"}</p>
          <p><span className="font-semibold">Chofer:</span> {hoja.chofer || "—"}</p>
          <p><span className="font-semibold">Estado:</span> {hoja.estado}</p>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left">
              <th className="py-2 pr-2">Tipo</th>
              <th className="py-2 pr-2">Origen</th>
              <th className="py-2 pr-2">Destino / Cliente</th>
              <th className="py-2 pr-2">Referencia</th>
              <th className="py-2 pr-2">N° Remito/Comprobante</th>
              <th className="py-2 pr-2 text-right">Bultos/Cajas</th>
              <th className="py-2 text-right">Unidades</th>
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
                    <td className="py-2 pr-2">{d?.numero_remito || "—"}</td>
                    <td className="py-2 pr-2 text-right">1</td>
                    <td className="py-2 text-right">—</td>
                  </tr>
                );
              }
              const d = it.detalle as DespachoDetalle | null;
              return (
                <tr key={it.id} className="border-b border-slate-300">
                  <td className="py-2 pr-2">Despacho</td>
                  <td className="py-2 pr-2">CD</td>
                  <td className="py-2 pr-2">{d?.cliente || "—"}</td>
                  <td className="py-2 pr-2">{d?.numero_guia || d?.guia || "—"}</td>
                  <td className="py-2 pr-2">{d?.numero_comprobante || "—"}</td>
                  <td className="py-2 pr-2 text-right">{d?.cajas ?? "—"}</td>
                  <td className="py-2 text-right">{d?.unidades ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
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

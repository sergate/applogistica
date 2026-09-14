"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtFecha } from "@/components/dashboard/formatters";

interface PedidoRemaManual {
  id: string;
  pedido: string;
  nota: string | null;
  created_at: string;
}

export default function RemaManual() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const [pedidosRemaManual, setPedidosRemaManual] = useState<PedidoRemaManual[]>([]);
  const [pedidosRemaManualLoading, setPedidosRemaManualLoading] = useState(false);
  const [pedidosRemaManualError, setPedidosRemaManualError] = useState<string | null>(null);
  const [formPedidosRemaTexto, setFormPedidosRemaTexto] = useState("");
  const [formPedidosRemaNota, setFormPedidosRemaNota] = useState("");
  const [agregandoPedidosRema, setAgregandoPedidosRema] = useState(false);

  const cargarPedidosRemaManual = async () => {
    setPedidosRemaManualLoading(true);
    setPedidosRemaManualError(null);
    try {
      const res = await fetch("/api/resumen/pedidos-rema", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los pedidos.");
      setPedidosRemaManual(data.pedidos);
    } catch (err) {
      setPedidosRemaManualError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPedidosRemaManualLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "REMA Manual") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPedidosRemaManual();
  }, [activeTab, dataVersion]);

  const agregarPedidosRemaManual = async () => {
    // Acepta pedidos separados por salto de línea, coma o espacio.
    const pedidos = Array.from(new Set(formPedidosRemaTexto.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean)));
    if (pedidos.length === 0) return;
    setAgregandoPedidosRema(true);
    setPedidosRemaManualError(null);
    try {
      const res = await fetch("/api/resumen/pedidos-rema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidos, nota: formPedidosRemaNota.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron agregar los pedidos.");
      setFormPedidosRemaTexto("");
      setFormPedidosRemaNota("");
      await cargarPedidosRemaManual();
      setDataVersion((v) => v + 1); // refresca la clasificación REMA/STD en Resumen, Por Fecha y Por Pedidos
    } catch (err) {
      setPedidosRemaManualError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAgregandoPedidosRema(false);
    }
  };

  const eliminarPedidoRemaManual = async (id: string, pedido: string) => {
    if (!confirm(`¿Seguro que querés dejar de considerar "${pedido}" como REMA? Volverá a clasificarse según su nombre.`)) return;
    setPedidosRemaManualError(null);
    try {
      const res = await fetch(`/api/resumen/pedidos-rema/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo eliminar el pedido.");
      await cargarPedidosRemaManual();
      setDataVersion((v) => v + 1);
    } catch (err) {
      setPedidosRemaManualError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  return (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-3xl">
                <h2 className="text-lg font-bold text-slate-800 mb-1">Cargar pedidos como REMA</h2>
                <p className="text-sm text-slate-500 mb-4">
                  Los pedidos que cargues acá se van a considerar REMA en Resumen, Por Fecha y Por Pedidos, aunque su
                  &quot;Nombre pedido&quot; no contenga la palabra &quot;rema&quot;. Dejan de contar como REMA apenas los borres de esta lista.
                  Pegá uno o varios números de pedido separados por espacio, coma o salto de línea.
                </p>
                {pedidosRemaManualError && (
                  <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{pedidosRemaManualError}</div>
                )}
                <textarea
                  value={formPedidosRemaTexto}
                  onChange={(e) => setFormPedidosRemaTexto(e.target.value)}
                  placeholder={"Ej: 123456\n123457\n123458"}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                />
                <input
                  type="text"
                  value={formPedidosRemaNota}
                  onChange={(e) => setFormPedidosRemaNota(e.target.value)}
                  placeholder="Nota (opcional, ej: motivo de la excepción)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-4"
                />
                <button
                  onClick={agregarPedidosRemaManual}
                  disabled={!formPedidosRemaTexto.trim() || agregandoPedidosRema}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    !formPedidosRemaTexto.trim() || agregandoPedidosRema
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {agregandoPedidosRema ? "Guardando..." : "Agregar pedidos"}
                </button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Pedidos cargados como REMA manual</h2>
                {pedidosRemaManualLoading && pedidosRemaManual.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-slate-500 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 text-left">Pedido</th>
                        <th className="py-3 px-4 text-left">Nota</th>
                        <th className="py-3 px-4 text-left">Cargado</th>
                        <th className="py-3 px-4 text-left">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pedidosRemaManual.map((p) => (
                        <tr key={p.id}>
                          <td className="py-3 px-4 text-left font-semibold text-slate-800">{p.pedido}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{p.nota || "—"}</td>
                          <td className="py-3 px-4 text-left text-slate-600">{fmtFecha(p.created_at)}</td>
                          <td className="py-3 px-4 text-left">
                            <button onClick={() => eliminarPedidoRemaManual(p.id, p.pedido)} className="text-sm text-red-600 hover:underline">
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pedidosRemaManual.length === 0 && !pedidosRemaManualLoading && (
                    <p className="text-sm text-slate-400 text-center py-8">No hay pedidos cargados como REMA manual todavía.</p>
                  )}
                </div>
              </div>
            </div>
  );
}

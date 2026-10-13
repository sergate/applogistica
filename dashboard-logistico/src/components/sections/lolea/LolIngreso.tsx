"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha } from "@/components/dashboard/formatters";
import LolArticuloPicker from "./LolArticuloPicker";

interface SkuIngreso {
  id: number;
  articulo: string;
  variante: string;
  unidad: string;
  stage: number;
}

interface MovimientoFila {
  id: number;
  fecha: string;
  tipo: "recepcion" | "ubicacion";
  articulo: string;
  variante: string;
  unidad: string;
  cantidad: number;
  destino: string;
  referencia: string;
  usuario: string;
}

interface IngresoData {
  skus: SkuIngreso[];
  movimientos: MovimientoFila[];
}

type Aviso = { ok: boolean; texto: string } | null;

const claseInput =
  "px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-full";

const esEntero = (v: string) => /^\d+$/.test(v.trim()) && Number(v) >= 1;

// Ingreso de mercadería: todo entra al stage (ubicación virtual sin límite) y
// después el maquinista lo ubica por partes en las posiciones, indicando cuánto
// transfiere (cada pallet trae su cantidad).
export default function LolIngreso() {
  const { activeTab, dataVersion, setDataVersion } = useDashboard();

  const { data, error, isLoading } = useTabData<IngresoData>(activeTab, "LOL-Ingreso", "/api/lolea/ingreso", dataVersion);

  const skus = useMemo(() => data?.skus ?? [], [data]);
  const movimientos = useMemo(() => data?.movimientos ?? [], [data]);

  const [skuRecibir, setSkuRecibir] = useState<number | null>(null);
  const [cantRecibir, setCantRecibir] = useState("");
  const [referencia, setReferencia] = useState("");
  const [avisoRecibir, setAvisoRecibir] = useState<Aviso>(null);

  const [skuUbicar, setSkuUbicar] = useState<number | null>(null);
  const [cantUbicar, setCantUbicar] = useState("");
  const [posicion, setPosicion] = useState("");
  const [avisoUbicar, setAvisoUbicar] = useState<Aviso>(null);

  const [trabajando, setTrabajando] = useState(false);

  const idRecibir = skuRecibir ?? skus[0]?.id ?? null;
  const idUbicar = skuUbicar ?? skus[0]?.id ?? null;
  const skuUbicarActual = skus.find((s) => s.id === idUbicar) ?? null;
  const enStage = skus.filter((s) => s.stage > 0);

  const llamar = async (url: string, cuerpo: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || "No se pudo completar la acción.");
    return json;
  };

  const recibir = async () => {
    setAvisoRecibir(null);
    if (idRecibir === null) return;
    if (!esEntero(cantRecibir)) {
      setAvisoRecibir({ ok: false, texto: "La cantidad tiene que ser un entero de 1 en adelante." });
      return;
    }
    setTrabajando(true);
    try {
      const sku = skus.find((s) => s.id === idRecibir);
      const json = await llamar("/api/lolea/ingreso/recibir", {
        skuId: idRecibir,
        cantidad: Number(cantRecibir),
        referencia,
      });
      setAvisoRecibir({
        ok: true,
        texto: `Recibidas ${cantRecibir} ${sku?.unidad.toLowerCase() ?? ""} en stage. Saldo en stage: ${fmtNum(json.stage)}.`,
      });
      setCantRecibir("");
      setReferencia("");
      setDataVersion((v) => v + 1);
    } catch (err) {
      setAvisoRecibir({ ok: false, texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setTrabajando(false);
    }
  };

  const ubicar = async () => {
    setAvisoUbicar(null);
    if (idUbicar === null) return;
    if (!esEntero(cantUbicar)) {
      setAvisoUbicar({ ok: false, texto: "La cantidad tiene que ser un entero de 1 en adelante." });
      return;
    }
    if (!posicion.trim()) {
      setAvisoUbicar({ ok: false, texto: "Falta escanear la posición." });
      return;
    }
    setTrabajando(true);
    try {
      const json = await llamar("/api/lolea/ingreso/ubicar", {
        skuId: idUbicar,
        cantidad: Number(cantUbicar),
        posicion,
      });
      setAvisoUbicar({
        ok: true,
        texto: `Ubicadas ${cantUbicar} en ${json.posicion}. En esa posición hay ahora ${fmtNum(json.enPosicion)}; quedan ${fmtNum(json.stageRestante)} en stage.`,
      });
      setCantUbicar("");
      setPosicion("");
      setDataVersion((v) => v + 1);
    } catch (err) {
      setAvisoUbicar({ ok: false, texto: err instanceof Error ? err.message : "Error inesperado." });
    } finally {
      setTrabajando(false);
    }
  };

  const claseAviso = (a: NonNullable<Aviso>) =>
    `mt-3 p-3 rounded-lg text-sm border ${
      a.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
    }`;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">Error al cargar: {error}</div>
      )}
      {isLoading && !data && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <SkeletonTable rows={4} columns={4} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-1">1. Recibir en stage</h2>
          <p className="text-sm text-slate-500 mb-4">Todo lo que llega entra al stage, sin límite de cantidad.</p>
          <div className="space-y-3">
            <div className="block text-xs font-semibold text-slate-500">
              Artículo y variante
              <div className="mt-1">
                <LolArticuloPicker skus={skus} value={idRecibir} onChange={setSkuRecibir} disabled={trabajando} />
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-500">
              Cantidad recibida
              <input
                type="text"
                inputMode="numeric"
                value={cantRecibir}
                onChange={(e) => setCantRecibir(e.target.value)}
                placeholder="Entero, en la unidad del artículo"
                className={`${claseInput} mt-1`}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-500">
              Proveedor o remito (opcional)
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                className={`${claseInput} mt-1`}
              />
            </label>
          </div>
          <button
            onClick={recibir}
            disabled={trabajando || idRecibir === null}
            className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Recibir en stage
          </button>
          {avisoRecibir && <div className={claseAviso(avisoRecibir)}>{avisoRecibir.texto}</div>}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-1">2. Ubicar desde stage</h2>
          <p className="text-sm text-slate-500 mb-4">
            Transferí a una posición la cantidad que trae cada pallet. Se puede ubicar por partes.
          </p>
          <div className="space-y-3">
            <div className="block text-xs font-semibold text-slate-500">
              Artículo y variante
              <div className="mt-1">
                <LolArticuloPicker skus={skus} value={idUbicar} onChange={setSkuUbicar} disabled={trabajando} />
              </div>
            </div>
            <p className="text-sm text-slate-600">
              En stage:{" "}
              <b className="text-slate-900">
                {skuUbicarActual ? `${fmtNum(skuUbicarActual.stage)} ${skuUbicarActual.unidad.toLowerCase()}` : "—"}
              </b>
            </p>
            <label className="block text-xs font-semibold text-slate-500">
              Cantidad a ubicar
              <input
                type="text"
                inputMode="numeric"
                value={cantUbicar}
                onChange={(e) => setCantUbicar(e.target.value)}
                placeholder="Lo que trae este pallet"
                className={`${claseInput} mt-1`}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-500">
              Posición
              <input
                type="text"
                value={posicion}
                onChange={(e) => setPosicion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void ubicar();
                }}
                placeholder="Escaneá o escribí la posición"
                className={`${claseInput} mt-1 font-mono`}
              />
            </label>
          </div>
          <button
            onClick={ubicar}
            disabled={trabajando || idUbicar === null}
            className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ubicar en la posición
          </button>
          {avisoUbicar && <div className={claseAviso(avisoUbicar)}>{avisoUbicar.texto}</div>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Saldo en stage</h2>
        <p className="text-sm text-slate-500 mb-4">Lo que ya se recibió y todavía no se ubicó en ninguna posición.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Artículo</th>
                <th className="py-3 px-4 text-left">Variante</th>
                <th className="py-3 px-4 text-left">Unidad</th>
                <th className="py-3 px-4 text-right">En stage</th>
                <th className="py-3 px-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enStage.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 text-left font-medium text-slate-900">{s.articulo}</td>
                  <td className="py-2.5 px-4 text-left text-slate-700">{s.variante}</td>
                  <td className="py-2.5 px-4 text-left text-slate-600">{s.unidad}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-900">{fmtNum(s.stage)}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => setSkuUbicar(s.id)}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Ubicar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {enStage.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-6">No hay nada en stage: todo está ubicado.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Últimos movimientos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Fecha y hora</th>
                <th className="py-3 px-4 text-left">Movimiento</th>
                <th className="py-3 px-4 text-left">Artículo</th>
                <th className="py-3 px-4 text-left">Variante</th>
                <th className="py-3 px-4 text-right">Cantidad</th>
                <th className="py-3 px-4 text-left">Destino</th>
                <th className="py-3 px-4 text-left">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movimientos.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="py-2 px-4 text-left text-slate-600">{fmtFecha(m.fecha)}</td>
                  <td className="py-2 px-4 text-left">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.tipo === "recepcion" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {m.tipo === "recepcion" ? "Recepción" : "Ubicación"}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-left text-slate-800 font-medium">{m.articulo}</td>
                  <td className="py-2 px-4 text-left text-slate-700">{m.variante}</td>
                  <td className="py-2 px-4 text-right text-slate-900 font-semibold">{fmtNum(m.cantidad)}</td>
                  <td className="py-2 px-4 text-left font-mono text-slate-700">
                    {m.destino}
                    {m.referencia ? <span className="ml-2 font-sans text-xs text-slate-400">{m.referencia}</span> : null}
                  </td>
                  <td className="py-2 px-4 text-left text-slate-600">{m.usuario}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movimientos.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-6">Todavía no hay movimientos de ingreso.</p>
          )}
        </div>
      </div>
    </div>
  );
}

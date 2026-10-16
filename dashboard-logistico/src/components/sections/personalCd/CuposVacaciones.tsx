"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { TRIMESTRES, getSemanas, semanaISO, semanaLabel } from "@/lib/personalVacaciones";

interface PuestoFila {
  id: number;
  nombre: string;
  empleados: number;
}

interface Tarjeta {
  id: number;
  nombre: string;
  puestosIds: number[];
}

interface Datos {
  puestos: PuestoFila[];
  sinPuesto: { empleados: number };
  cupos: Record<string, number>;
  usado: Record<string, number>;
  tarjetas: Tarjeta[];
}

interface Detalle {
  puestoId: number;
  puestoNombre: string;
  semana: string;
  cupo: number;
  usado: number;
  personas: { legajo: string; apellidoNombre: string; dias: number }[] | null;
}

interface Edicion {
  /** null = tarjeta nueva, todavía sin guardar. */
  id: number | null;
  nombre: string;
  puestosIds: number[];
}

type Estado = "ok" | "completo" | "excedido" | "sinCupo";

const SIN_PUESTO_ID = 0;
const ESTILO: Record<Estado, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  completo: "bg-amber-100 text-amber-700",
  excedido: "bg-red-100 text-red-700",
  sinCupo: "bg-slate-100 text-slate-500",
};
const BARRA: Record<Estado, string> = {
  ok: "bg-emerald-500",
  completo: "bg-amber-500",
  excedido: "bg-red-500",
  sinCupo: "bg-slate-400",
};

const estadoDe = (usado: number, cupo: number): Estado =>
  !cupo ? "sinCupo" : usado > cupo ? "excedido" : usado === cupo ? "completo" : "ok";

function trimestreVigenteIdx(): number {
  const hoy = new Date();
  const idx = TRIMESTRES.findIndex((t) => hoy >= t.inicio && hoy <= t.fin);
  return idx >= 0 ? idx : 0;
}

const fmtSemana = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

// Cupos de vacaciones por puesto y por semana (cuántas personas pueden estar de
// vacaciones), comparados contra lo que está cargado en Vacaciones. El "usado" de
// cada celda se calcula solo; el cupo lo asigna quien tenga PCD-CuposEditar; las
// tarjetas de comparación con nombre las arma quien tenga PCD-CuposComparar.
export default function CuposVacaciones() {
  const { activeTab, tienePermiso } = useDashboard();
  const puedeEditar = tienePermiso("PCD-CuposEditar");
  const puedeComparar = tienePermiso("PCD-CuposComparar");

  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [trimIdx, setTrimIdx] = useState(trimestreVigenteIdx);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [rellenarId, setRellenarId] = useState<number | null>(null);
  const [rellenarValor, setRellenarValor] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/cupos", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar Cupos Vacaciones.");
      setDatos(data as Datos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "PCD-Cupos" && datos === null) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const trimestre = TRIMESTRES[trimIdx];
  const semanas = useMemo(() => getSemanas(trimestre.inicio, trimestre.fin).map(semanaISO), [trimestre]);

  /** Filas de la grilla: los puestos de la lista maestra y, al final, "Sin puesto". */
  const filas = useMemo(() => {
    if (!datos) return [];
    return [
      ...datos.puestos,
      { id: SIN_PUESTO_ID, nombre: "Sin puesto", empleados: datos.sinPuesto.empleados },
    ];
  }, [datos]);

  const cupoDe = (puestoId: number, semana: string) => datos?.cupos[`${puestoId}|${semana}`] ?? 0;
  const usadoDe = (puestoId: number, semana: string) => datos?.usado[`${puestoId}|${semana}`] ?? 0;

  const totales = useMemo(
    () =>
      semanas.map((s) => ({
        cupo: (datos?.puestos ?? []).reduce((acc, p) => acc + (datos?.cupos[`${p.id}|${s}`] ?? 0), 0),
        usado: filas.reduce((acc, p) => acc + (datos?.usado[`${p.id}|${s}`] ?? 0), 0),
      })),
    [datos, filas, semanas]
  );

  const llamar = async (url: string, metodo: string, cuerpo?: unknown) => {
    const res = await fetch(url, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || "No se pudo completar la acción.");
    return json;
  };

  const guardarCupo = async (puestoId: number, semanasAfectadas: string[], cupo: number) => {
    setError(null);
    setAviso(null);
    // Se actualiza en pantalla al toque; si falla, se vuelve a cargar lo que hay en la base.
    setDatos((prev) => {
      if (!prev) return prev;
      const cupos = { ...prev.cupos };
      for (const s of semanasAfectadas) {
        if (cupo > 0) cupos[`${puestoId}|${s}`] = cupo;
        else delete cupos[`${puestoId}|${s}`];
      }
      return { ...prev, cupos };
    });
    try {
      await llamar("/api/personal/cupos", "PUT", { puestoId, semanas: semanasAfectadas, cupo });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      await cargar();
    }
  };

  const rellenar = async (p: PuestoFila) => {
    const n = Number(rellenarValor);
    if (!Number.isInteger(n) || n < 0) {
      setError("El cupo tiene que ser un entero de 0 en adelante.");
      return;
    }
    setRellenarId(null);
    await guardarCupo(p.id, semanas, n);
    setAviso(`Cupo de ${p.nombre} fijado en ${n} para las ${semanas.length} semanas de ${trimestre.label}.`);
  };

  const abrirDetalle = async (p: PuestoFila, semana: string) => {
    if (detalle && detalle.puestoId === p.id && detalle.semana === semana) {
      setDetalle(null);
      return;
    }
    setDetalle({ puestoId: p.id, puestoNombre: p.nombre, semana, cupo: cupoDe(p.id, semana), usado: usadoDe(p.id, semana), personas: null });
    try {
      const res = await fetch(`/api/personal/cupos/detalle?puestoId=${p.id}&semana=${semana}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo cargar el detalle.");
      setDetalle((prev) => (prev && prev.puestoId === p.id && prev.semana === semana ? { ...prev, personas: json.personas } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      setDetalle(null);
    }
  };

  const guardarTarjeta = async () => {
    if (!edicion) return;
    setTrabajando(true);
    setError(null);
    try {
      if (edicion.id === null) {
        await llamar("/api/personal/cupos/tarjetas", "POST", { nombre: edicion.nombre, puestosIds: edicion.puestosIds });
      } else {
        await llamar(`/api/personal/cupos/tarjetas/${edicion.id}`, "PATCH", { nombre: edicion.nombre, puestosIds: edicion.puestosIds });
      }
      setEdicion(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setTrabajando(false);
    }
  };

  const eliminarTarjeta = async (t: Tarjeta) => {
    if (!confirm(`¿Borrar la tarjeta "${t.nombre}"?`)) return;
    setTrabajando(true);
    setError(null);
    try {
      await llamar(`/api/personal/cupos/tarjetas/${t.id}`, "DELETE");
      setEdicion(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setTrabajando(false);
    }
  };

  const alternarPuesto = (id: number) =>
    setEdicion((prev) =>
      prev ? { ...prev, puestosIds: prev.puestosIds.includes(id) ? prev.puestosIds.filter((x) => x !== id) : [...prev.puestosIds, id] } : prev
    );

  const exportarExcel = async () => {
    if (!datos) return;
    const XLSX = await import("xlsx");
    const semanasCiclo = [...new Set(TRIMESTRES.flatMap((t) => getSemanas(t.inicio, t.fin).map(semanaISO)))].sort();
    const arma = (valor: (p: PuestoFila, s: string) => number | string) =>
      filas.map((p) => {
        const fila: Record<string, string | number> = { Puesto: p.nombre, Empleados: p.empleados };
        for (const s of semanasCiclo) fila[`Sem. ${s.split("-").reverse().join("/")}`] = valor(p, s);
        return fila;
      });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(arma((p, s) => (p.id === SIN_PUESTO_ID ? "" : cupoDe(p.id, s) || ""))), "Cupos");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(arma((p, s) => usadoDe(p.id, s) || "")), "Usado");
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(arma((p, s) => (p.id !== SIN_PUESTO_ID && cupoDe(p.id, s) ? cupoDe(p.id, s) - usadoDe(p.id, s) : ""))),
      "Diferencia (cupo - usado)"
    );
    XLSX.writeFile(libro, `personal_cd_cupos_vacaciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const claseBoton = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors";

  /** Tarjeta de comparación: total de sus puestos contra su cupo, semana por semana. */
  const tarjetaVista = (t: Tarjeta) => {
    const activos = new Map((datos?.puestos ?? []).map((p) => [p.id, p]));
    const vigentes = t.puestosIds.filter((id) => activos.has(id));
    const inactivos = t.puestosIds.length - vigentes.length;
    const cupoSemana = semanas.map((s) => vigentes.reduce((acc, id) => acc + cupoDe(id, s), 0));
    const usadoSemana = semanas.map((s) => vigentes.reduce((acc, id) => acc + usadoDe(id, s), 0));
    const excedidas = usadoSemana.filter((u, k) => cupoSemana[k] > 0 && u > cupoSemana[k]).length;
    let pico = -1;
    let picoRatio = 0;
    usadoSemana.forEach((u, k) => {
      if (cupoSemana[k] > 0 && u / cupoSemana[k] > picoRatio) {
        picoRatio = u / cupoSemana[k];
        pico = k;
      }
    });
    const maximo = Math.max(1, ...cupoSemana, ...usadoSemana);
    const empleados = vigentes.reduce((acc, id) => acc + (activos.get(id)?.empleados ?? 0), 0);

    return (
      <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-slate-800">{t.nombre}</h3>
            <p className="text-xs text-slate-500">
              Total de los puestos elegidos contra su cupo, semana por semana ({trimestre.label}).
            </p>
          </div>
          {puedeComparar && (
            <div className="flex gap-2">
              <button
                onClick={() => setEdicion({ id: t.id, nombre: t.nombre, puestosIds: t.puestosIds })}
                className={`${claseBoton} bg-slate-100 text-slate-700 hover:bg-slate-200`}
              >
                Configurar
              </button>
              <button onClick={() => eliminarTarjeta(t)} disabled={trabajando} className={`${claseBoton} bg-red-50 text-red-600 hover:bg-red-100`}>
                Eliminar
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {vigentes.length === 0 && <span className="text-xs text-slate-400">Todavía no tiene puestos{puedeComparar ? ": tocá Configurar." : "."}</span>}
          {vigentes.map((id) => (
            <span key={id} className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
              {activos.get(id)?.nombre}
            </span>
          ))}
          {inactivos > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              {inactivos} puesto(s) inactivo(s)
            </span>
          )}
        </div>

        {vigentes.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3 my-4 max-w-2xl">
              <div className="border border-slate-200 rounded-lg px-4 py-2.5">
                <div className="text-xl font-bold text-slate-900">{excedidas}</div>
                <div className="text-xs text-slate-500">Semanas excedidas</div>
              </div>
              <div className="border border-slate-200 rounded-lg px-4 py-2.5">
                <div className="text-xl font-bold text-slate-900">{pico >= 0 ? fmtSemana(semanas[pico]) : "—"}</div>
                <div className="text-xs text-slate-500">
                  Semana más cargada{pico >= 0 ? ` (${usadoSemana[pico]} de ${cupoSemana[pico]})` : ""}
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg px-4 py-2.5">
                <div className="text-xl font-bold text-slate-900">{empleados}</div>
                <div className="text-xs text-slate-500">Empleados en esos puestos</div>
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Usado contra cupo por semana">
              {semanas.map((s, k) => {
                const estado = estadoDe(usadoSemana[k], cupoSemana[k]);
                return (
                  <div key={s} className="flex flex-col items-center gap-1 min-w-[52px] flex-1 text-[11px] text-slate-500">
                    <div
                      className="relative w-full h-20 bg-slate-100 rounded overflow-hidden"
                      title={`Usado ${usadoSemana[k]} de cupo ${cupoSemana[k]}`}
                    >
                      <div className={`absolute left-0 right-0 bottom-0 ${BARRA[estado]}`} style={{ height: `${(usadoSemana[k] / maximo) * 100}%` }} />
                      <div className="absolute left-0 right-0 border-t-2 border-dashed border-slate-700/60" style={{ bottom: `${(cupoSemana[k] / maximo) * 100}%` }} />
                    </div>
                    <b className="text-xs text-slate-800 tabular-nums">
                      {usadoSemana[k]}/{cupoSemana[k]}
                    </b>
                    <span>{fmtSemana(s)}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-2">La línea punteada es el cupo total; la barra es lo usado.</p>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Cupos Vacaciones</h2>
          <p className="text-sm text-slate-500">
            Cuántas personas de cada puesto pueden estar de vacaciones por semana, comparado contra lo cargado en Vacaciones.
          </p>
        </div>
        <button
          onClick={exportarExcel}
          disabled={!datos || filas.length === 0}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            !datos || filas.length === 0 ? "bg-slate-100 text-slate-300 cursor-not-allowed" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          Exportar a Excel
        </button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      {aviso && <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{aviso}</div>}

      <div className="flex items-center gap-2 flex-wrap">
        {TRIMESTRES.map((t, i) => (
          <button
            key={t.label}
            onClick={() => {
              setTrimIdx(i);
              setDetalle(null);
              setRellenarId(null);
              setAviso(null);
            }}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              i === trimIdx ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TARJETAS DE COMPARACIÓN */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-700">Tarjetas de comparación</h3>
          {puedeComparar && edicion === null && (
            <button
              onClick={() => setEdicion({ id: null, nombre: "", puestosIds: [] })}
              className="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              + Nueva tarjeta
            </button>
          )}
        </div>

        {edicion && puedeComparar && (
          <div className="bg-white rounded-xl border-2 border-blue-300 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-700">{edicion.id === null ? "Nueva tarjeta" : "Configurar tarjeta"}</h3>
            <input
              type="text"
              value={edicion.nombre}
              maxLength={40}
              onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
              placeholder="Nombre de la tarjeta (por ejemplo NTC)"
              aria-label="Nombre de la tarjeta"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm w-80 max-w-full focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-slate-500">Elegí los puestos que querés comparar en esta tarjeta:</p>
            <div className="flex flex-wrap gap-1.5">
              {(datos?.puestos ?? []).map((p) => {
                const elegido = edicion.puestosIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={elegido}
                    onClick={() => alternarPuesto(p.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      elegido ? "bg-blue-50 text-blue-700 border-blue-400" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {p.nombre}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={guardarTarjeta}
                disabled={!edicion.nombre.trim() || trabajando}
                className={`px-5 py-2 rounded-lg text-sm font-semibold ${
                  !edicion.nombre.trim() || trabajando ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {trabajando ? "Guardando..." : "Guardar tarjeta"}
              </button>
              <button onClick={() => setEdicion(null)} className="px-5 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {datos && datos.tarjetas.length === 0 && edicion === null && (
          <p className="text-sm text-slate-400">Todavía no hay tarjetas.{puedeComparar ? ' Creá la primera con "Nueva tarjeta".' : ""}</p>
        )}
        {datos?.tarjetas.map((t) => tarjetaVista(t))}
      </div>

      {/* GRILLA DE CUPOS */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-700">Cupos por puesto y semana</h3>
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
          {(
            [
              ["ok", "Dentro del cupo"],
              ["completo", "Cupo completo"],
              ["excedido", "Excedido"],
              ["sinCupo", "Sin cupo asignado"],
            ] as [Estado, string][]
          ).map(([estado, texto]) => (
            <span key={estado} className="flex items-center gap-1.5">
              <i className={`inline-block w-2.5 h-2.5 rounded-sm ${BARRA[estado]}`} />
              {texto}
            </span>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-auto max-h-[70vh]">
          {cargando && datos === null && <p className="p-6 text-sm text-slate-400">Cargando...</p>}
          {datos !== null && datos.puestos.length === 0 && (
            <p className="p-6 text-sm text-slate-400">Todavía no hay puestos: creálos en Personal CD → Sectores.</p>
          )}
          {datos !== null && filas.length > 0 && (
            <table className="border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="sticky left-0 top-0 z-20 bg-slate-50 text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap min-w-[210px]">
                    Puesto
                  </th>
                  {semanas.map((s) => (
                    <th key={s} className="sticky top-0 z-10 bg-slate-50 text-center py-2.5 px-1 text-slate-500 font-semibold whitespace-nowrap text-[11px]">
                      {semanaLabel(new Date(`${s}T00:00:00`))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => {
                  const esSinPuesto = p.id === SIN_PUESTO_ID;
                  return (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="sticky left-0 z-10 bg-white py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-3">
                          <span>
                            <b className="text-slate-800">{p.nombre}</b> <span className="text-slate-400 text-xs">{p.empleados} emp.</span>
                          </span>
                          {puedeEditar && !esSinPuesto && rellenarId !== p.id && (
                            <button
                              onClick={() => {
                                setRellenarId(p.id);
                                setRellenarValor("");
                              }}
                              title="Pone el mismo cupo en todas las semanas del trimestre"
                              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              Rellenar
                            </button>
                          )}
                          {rellenarId === p.id && (
                            <span className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                autoFocus
                                value={rellenarValor}
                                onChange={(e) => setRellenarValor(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && rellenar(p)}
                                aria-label="Cupo para todo el trimestre"
                                className="w-12 text-center border border-slate-300 rounded px-1 py-0.5 text-xs"
                              />
                              <button onClick={() => rellenar(p)} className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-600 text-white">
                                OK
                              </button>
                              <button onClick={() => setRellenarId(null)} className="text-[11px] text-slate-400 hover:underline">
                                ✕
                              </button>
                            </span>
                          )}
                        </div>
                      </td>
                      {semanas.map((s) => {
                        const cupo = cupoDe(p.id, s);
                        const usado = usadoDe(p.id, s);
                        const estado = estadoDe(usado, cupo);
                        return (
                          <td key={s} className="py-1 px-0.5 text-center align-top min-w-[62px]">
                            {esSinPuesto ? (
                              <div className="h-[26px]" />
                            ) : (
                              <input
                                type="number"
                                min={0}
                                defaultValue={cupo || ""}
                                key={`${p.id}-${s}-${cupo}`}
                                disabled={!puedeEditar}
                                aria-label={`Cupo de ${p.nombre} semana ${fmtSemana(s)}`}
                                onBlur={(e) => {
                                  const n = e.target.value === "" ? 0 : Number(e.target.value);
                                  if (!Number.isInteger(n) || n < 0) {
                                    setError("El cupo tiene que ser un entero de 0 en adelante.");
                                    return;
                                  }
                                  if (n !== cupo) void guardarCupo(p.id, [s], n);
                                }}
                                className={`w-11 text-center border rounded px-0.5 py-1 text-xs font-semibold ${
                                  puedeEditar ? "border-slate-200 bg-slate-50" : "border-dashed border-slate-200 bg-slate-50 opacity-70"
                                }`}
                              />
                            )}
                            <button
                              onClick={() => abrirDetalle(p, s)}
                              disabled={usado === 0}
                              title={usado > 0 ? "Ver quiénes son" : undefined}
                              className={`block w-full mt-0.5 rounded px-1 py-0.5 text-[11px] font-semibold ${ESTILO[estado]} ${
                                usado > 0 ? "cursor-pointer hover:brightness-95" : "cursor-default"
                              }`}
                            >
                              {usado}
                              {cupo ? ` / ${cupo}` : ""}
                              {cupo && usado > cupo ? ` (+${usado - cupo})` : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-bold">
                  <td className="sticky left-0 z-10 bg-slate-50 py-2 px-3 text-slate-800">Total</td>
                  {totales.map((t, k) => {
                    const estado = estadoDe(t.usado, t.cupo);
                    return (
                      <td key={semanas[k]} className="py-1.5 px-0.5 text-center">
                        <div className="text-slate-800">{t.cupo || ""}</div>
                        <div className={`rounded px-1 py-0.5 text-[11px] ${ESTILO[estado]}`}>
                          {t.usado}
                          {t.cupo && t.usado > t.cupo ? ` (+${t.usado - t.cupo})` : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Arriba de cada celda va el cupo (personas que pueden estar de vacaciones); debajo, las que tienen días cargados en Vacaciones esa
          semana. Tocá lo usado para ver quiénes son. &quot;Sin puesto&quot; incluye a los empleados sin puesto o con un puesto que todavía no
          está en la lista de Sectores.
        </p>
      </div>

      {/* DETALLE: QUIÉNES USAN EL CUPO */}
      {detalle && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">
              {detalle.puestoNombre} · semana del {fmtSemana(detalle.semana)}
            </h3>
            <button onClick={() => setDetalle(null)} className={`${claseBoton} bg-white text-slate-600 border border-slate-200 hover:bg-slate-100`}>
              Cerrar
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {detalle.usado} persona(s) con vacaciones cargadas · cupo {detalle.cupo || "sin asignar"}
            {detalle.cupo > 0 && detalle.usado > detalle.cupo && (
              <b className="text-red-600"> · excedido en {detalle.usado - detalle.cupo}</b>
            )}
          </p>
          {detalle.personas === null ? (
            <p className="text-sm text-slate-400">Cargando...</p>
          ) : detalle.personas.length === 0 ? (
            <p className="text-sm text-slate-400">Nadie de este puesto tiene vacaciones esa semana.</p>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Legajo</th>
                    <th className="py-2 px-3">Apellido y Nombre</th>
                    <th className="py-2 px-3 text-right">Días en la semana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detalle.personas.map((e) => (
                    <tr key={e.legajo}>
                      <td className="py-2 px-3 font-mono text-slate-600">{e.legajo}</td>
                      <td className="py-2 px-3 text-slate-800">{e.apellidoNombre}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800">{e.dias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

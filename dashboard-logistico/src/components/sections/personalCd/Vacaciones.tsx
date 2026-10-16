"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { TRIMESTRES, getSemanas, semanaISO, semanaLabel } from "@/lib/personalVacaciones";

interface EmpleadoVacaciones {
  id: number;
  legajo: string;
  apellidoNombre: string;
  sector: string | null;
  adeudadas: number;
  actualesCalculado: number;
  actualesManual: number | null;
  actualesFinal: number;
  saldo: number;
  cargas: Record<string, number>;
}

function trimestreVigenteIdx(): number {
  const hoy = new Date();
  const idx = TRIMESTRES.findIndex((t) => hoy >= t.inicio && hoy <= t.fin);
  return idx >= 0 ? idx : 0;
}

export default function Vacaciones() {
  const { activeTab } = useDashboard();

  const [empleados, setEmpleados] = useState<EmpleadoVacaciones[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [trimIdx, setTrimIdx] = useState(trimestreVigenteIdx);
  const [guardandoKey, setGuardandoKey] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroSector, setFiltroSector] = useState("");

  const cargarVacaciones = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/vacaciones");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar Vacaciones.");
      setEmpleados(data.empleados);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "PCD-Vacaciones" && empleados === null) cargarVacaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const trimestre = TRIMESTRES[trimIdx];
  const semanas = useMemo(() => getSemanas(trimestre.inicio, trimestre.fin), [trimestre]);

  const sectores = useMemo(() => {
    if (!empleados) return [];
    return [...new Set(empleados.map((e) => e.sector).filter((s): s is string => !!s))].sort();
  }, [empleados]);

  const filtrados = useMemo(() => {
    if (!empleados) return [];
    const q = busqueda.trim().toLowerCase();
    return empleados.filter((e) => {
      if (q && !e.legajo.toLowerCase().includes(q) && !e.apellidoNombre.toLowerCase().includes(q)) return false;
      if (filtroSector && e.sector !== filtroSector) return false;
      return true;
    });
  }, [empleados, busqueda, filtroSector]);

  // Exporta los empleados filtrados con UNA columna por cada semana de todo el
  // ciclo (no solo del trimestre que se está mirando); las semanas sin días
  // cargados quedan en blanco.
  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const semanasCiclo = new Map<string, Date>();
    for (const t of TRIMESTRES) {
      for (const s of getSemanas(t.inicio, t.fin)) semanasCiclo.set(semanaISO(s), s);
    }
    const ordenadas = [...semanasCiclo.entries()].sort(([a], [b]) => a.localeCompare(b));

    const filas = filtrados.map((e) => {
      const fila: Record<string, string | number> = {
        Legajo: e.legajo,
        "Apellido y Nombre": e.apellidoNombre,
        Sector: e.sector ?? "",
        "Vac. adeudadas": e.adeudadas,
        "Vac. actuales": e.actualesFinal,
        Saldo: e.saldo,
      };
      for (const [iso, s] of ordenadas) {
        const dias = e.cargas[iso] || 0;
        fila[`Sem. ${semanaLabel(s)}/${s.getFullYear()}`] = dias > 0 ? dias : "";
      }
      return fila;
    });

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Vacaciones");
    XLSX.writeFile(libro, `personal_cd_vacaciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const guardarCarga = async (empleadoId: number, semanaInicioISO: string, dias: number) => {
    const key = `${empleadoId}-${semanaInicioISO}`;
    setGuardandoKey(key);
    setError(null);
    try {
      const res = await fetch(`/api/personal/vacaciones/${empleadoId}/carga`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semanaInicio: semanaInicioISO, dias }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar la carga.");
      await cargarVacaciones();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardandoKey(null);
    }
  };

  const guardarAdeudadas = async (empleadoId: number, valor: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/personal/vacaciones/${empleadoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adeudadas: valor }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar.");
      await cargarVacaciones();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const guardarActualesManual = async (empleadoId: number, valor: number | null) => {
    setError(null);
    try {
      const res = await fetch(`/api/personal/vacaciones/${empleadoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualesManual: valor }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo guardar.");
      await cargarVacaciones();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Vacaciones</h2>
        <p className="text-sm text-slate-500">
          Se muestra un trimestre a la vez, de octubre 2026 a noviembre 2027. Cargar días en una semana resta del saldo.
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2 flex-wrap">
        {TRIMESTRES.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setTrimIdx(i)}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              i === trimIdx ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar por legajo o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <select value={filtroSector} onChange={(e) => setFiltroSector(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
          <option value="">Todos los sectores</option>
          {sectores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={exportarExcel}
          disabled={filtrados.length === 0}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            filtrados.length === 0
              ? "bg-slate-100 text-slate-300 cursor-not-allowed"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          Exportar a Excel
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        {cargando && empleados === null && <p className="p-6 text-sm text-slate-400">Cargando...</p>}
        {empleados !== null && empleados.length > 0 && filtrados.length === 0 && <p className="p-6 text-sm text-slate-400">Sin resultados.</p>}
        {empleados !== null && empleados.length === 0 && <p className="p-6 text-sm text-slate-400">Sin empleados activos.</p>}
        {empleados !== null && filtrados.length > 0 && (
          <table className="border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-10 bg-slate-50 text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Legajo</th>
                <th className="sticky left-[62px] z-10 bg-slate-50 text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Apellido y Nombre</th>
                <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Sector</th>
                <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Vac. Adeud.</th>
                <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Vac. Actuales</th>
                <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap border-r-2 border-slate-200">Saldo</th>
                {semanas.map((s) => (
                  <th key={semanaISO(s)} className="text-center py-2.5 px-1 text-slate-500 font-semibold whitespace-nowrap text-[11px]">
                    {semanaLabel(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e) => {
                const esManual = e.actualesManual !== null;
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="sticky left-0 bg-white py-2 px-3 text-slate-500 whitespace-nowrap">{e.legajo}</td>
                    <td className="sticky left-[62px] bg-white py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">{e.apellidoNombre}</td>
                    <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{e.sector || "—"}</td>
                    <td className="py-1.5 px-3 text-right">
                      <input
                        type="number"
                        min={0}
                        defaultValue={e.adeudadas}
                        key={`adeudadas-${e.id}-${e.adeudadas}`}
                        onBlur={(ev) => {
                          const n = Number(ev.target.value);
                          if (!Number.isNaN(n) && n !== e.adeudadas) guardarAdeudadas(e.id, n);
                        }}
                        className="w-14 text-right border border-slate-200 bg-slate-50 rounded px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min={0}
                          defaultValue={e.actualesFinal}
                          key={`actuales-${e.id}-${e.actualesFinal}`}
                          onBlur={(ev) => {
                            const n = Number(ev.target.value);
                            if (!Number.isNaN(n) && n !== e.actualesFinal) guardarActualesManual(e.id, n);
                          }}
                          className={`w-14 text-right border rounded px-1.5 py-1 text-xs ${esManual ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
                        />
                      </div>
                      <div
                        onClick={() => esManual && guardarActualesManual(e.id, null)}
                        className={`text-[10px] text-right mt-0.5 ${esManual ? "text-amber-600 cursor-pointer" : "text-slate-400"}`}
                      >
                        {esManual ? "Editado · restablecer" : "Automático"}
                      </div>
                    </td>
                    <td className={`py-2 px-3 text-right font-bold border-r-2 border-slate-200 ${e.saldo <= 3 ? "text-red-600" : "text-slate-800"}`}>
                      {e.saldo}
                    </td>
                    {semanas.map((s) => {
                      const iso = semanaISO(s);
                      const valor = e.cargas[iso] || 0;
                      const key = `${e.id}-${iso}`;
                      return (
                        <td key={iso} className="py-1 px-0.5 text-center">
                          <input
                            type="number"
                            min={0}
                            defaultValue={valor}
                            key={`${key}-${valor}`}
                            disabled={guardandoKey === key}
                            onBlur={(ev) => {
                              const n = Number(ev.target.value) || 0;
                              if (n !== valor) guardarCarga(e.id, iso, n);
                            }}
                            className={`w-9 text-center border rounded px-0.5 py-1 text-xs ${valor > 0 ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

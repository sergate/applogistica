"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { parseExcelFileConFechas } from "@/lib/fileParsers";

interface Sector {
  id: number;
  nombre: string;
  activo: boolean;
}

interface Empleado {
  id: number;
  legajo: string;
  apellido_nombre: string;
  dni: string | null;
  fecha_nacimiento: string | null;
  fecha_ingreso: string;
  sector_id: number | null;
  sectorNombre: string | null;
  puesto: string | null;
  turno: string | null;
  tipo_contrato: string | null;
  estado: "Activo" | "Licencia" | "Baja";
  telefono: string | null;
  email: string | null;
  antiguedad: string;
}

const TURNOS = ["Mañana", "Tarde", "Noche", "Central"];
const CONTRATOS = ["Efectivo", "Eventual", "Pasantía"];
const ESTADOS: Empleado["estado"][] = ["Activo", "Licencia", "Baja"];

// Columnas esperadas del Excel de importación (headers ya normalizados por
// parseExcelFileConFechas: minúsculas, sin acentos, "_" en vez de espacios)
// -> nombre de campo que espera /api/personal/dotacion/import.
const COLUMNAS_IMPORT_DOTACION: Record<string, string> = {
  legajo: "legajo",
  apellido_y_nombre: "apellidoNombre",
  dni: "dni",
  fecha_nacimiento: "fechaNacimiento",
  fecha_ingreso: "fechaIngreso",
  sector: "sector",
  puesto: "puesto",
  turno: "turno",
  tipo_contrato: "tipoContrato",
  telefono: "telefono",
  email: "email",
};

const nuevoEmpleadoVacio = {
  legajo: "",
  apellidoNombre: "",
  dni: "",
  fechaIngreso: "",
  sectorId: "",
  puesto: "",
  turno: "",
  tipoContrato: "",
};

export default function Dotacion() {
  const { activeTab } = useDashboard();

  const [empleados, setEmpleados] = useState<Empleado[] | null>(null);
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [filtroSector, setFiltroSector] = useState("");
  const [filtroTurno, setFiltroTurno] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoEmpleado, setNuevoEmpleado] = useState(nuevoEmpleadoVacio);
  const [guardando, setGuardando] = useState(false);

  const [mostrarImport, setMostrarImport] = useState(false);
  const [archivoImport, setArchivoImport] = useState<File | null>(null);
  const [procesandoImport, setProcesandoImport] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<{
    procesados: number;
    filasConError: { fila: number; motivo: string }[];
    sectoresNoEncontrados: string[];
  } | null>(null);
  const inputImportRef = useRef<HTMLInputElement>(null);

  const cargarDotacion = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/dotacion");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cargar la dotación.");
      setEmpleados(data.empleados);
      setSectores(data.sectores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === "PCD-Dotacion" && empleados === null) cargarDotacion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const cambiarSector = async (empleadoId: number, sectorId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/personal/dotacion/${empleadoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId: sectorId ? Number(sectorId) : null }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cambiar el sector.");
      await cargarDotacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  };

  const cambiarEstado = async (empleadoId: number, estado: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/personal/dotacion/${empleadoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo cambiar el estado.");
      await cargarDotacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  };

  const crearEmpleado = async () => {
    if (!nuevoEmpleado.legajo.trim() || !nuevoEmpleado.apellidoNombre.trim() || !nuevoEmpleado.fechaIngreso) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/dotacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...nuevoEmpleado,
          sectorId: nuevoEmpleado.sectorId ? Number(nuevoEmpleado.sectorId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo crear el empleado.");
      setNuevoEmpleado(nuevoEmpleadoVacio);
      setMostrarForm(false);
      await cargarDotacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  };

  const handleImportar = async () => {
    if (!archivoImport) return;
    setProcesandoImport(true);
    setError(null);
    setResultadoImport(null);
    try {
      const registrosCrudos = await parseExcelFileConFechas(archivoImport, ["fecha_nacimiento", "fecha_ingreso"]);
      if (registrosCrudos.length === 0) throw new Error("El archivo no tiene filas de datos.");

      const registros = registrosCrudos.map((r) => {
        const mapeado: Record<string, unknown> = {};
        for (const key of Object.keys(r)) {
          const campoFinal = COLUMNAS_IMPORT_DOTACION[key];
          if (campoFinal) mapeado[campoFinal] = r[key];
        }
        return mapeado;
      });

      const res = await fetch("/api/personal/dotacion/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registros }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudo importar el archivo.");

      setResultadoImport({
        procesados: data.procesados,
        filasConError: data.filasConError || [],
        sectoresNoEncontrados: data.sectoresNoEncontrados || [],
      });
      setArchivoImport(null);
      if (inputImportRef.current) inputImportRef.current.value = "";
      await cargarDotacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setProcesandoImport(false);
    }
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (empleados || []).filter((e) => {
      if (filtroSector && String(e.sector_id || "") !== filtroSector) return false;
      if (filtroTurno && e.turno !== filtroTurno) return false;
      if (filtroEstado && e.estado !== filtroEstado) return false;
      if (q && !e.legajo.toLowerCase().includes(q) && !e.apellido_nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [empleados, busqueda, filtroSector, filtroTurno, filtroEstado]);

  const kpis = useMemo(() => {
    const lista = empleados || [];
    return {
      total: lista.length,
      activos: lista.filter((e) => e.estado === "Activo").length,
      licencia: lista.filter((e) => e.estado === "Licencia").length,
      bajas: lista.filter((e) => e.estado === "Baja").length,
    };
  }, [empleados]);

  const estadoEstilo = (estado: Empleado["estado"]) => {
    if (estado === "Activo") return "bg-green-100 text-green-700";
    if (estado === "Licencia") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-500";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Dotación</h2>
          <p className="text-sm text-slate-500">Padrón de personal del Centro de Distribución</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMostrarImport((v) => !v);
              setResultadoImport(null);
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {mostrarImport ? "Cancelar" : "Importar Excel"}
          </button>
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {mostrarForm ? "Cancelar" : "+ Nuevo Empleado"}
          </button>
        </div>
      </div>

      {mostrarImport && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Importar dotación (altas masivas)</h3>
          <p className="text-sm text-slate-500">
            Excel con columnas: <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Legajo</span>,{" "}
            <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Apellido y Nombre</span>,{" "}
            <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Fecha Ingreso</span> (obligatorias), y opcionalmente
            DNI, Fecha Nacimiento, Sector, Puesto, Turno, Tipo Contrato, Teléfono, Email. Si el Legajo ya existe, actualiza esos datos en
            vez de duplicarlo.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={inputImportRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setArchivoImport(e.target.files?.[0] || null)}
              className="text-sm"
            />
            <button
              onClick={handleImportar}
              disabled={!archivoImport || procesandoImport}
              className={`px-5 py-2 rounded-lg text-sm font-semibold ${
                !archivoImport || procesandoImport ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {procesandoImport ? "Procesando..." : "Procesar"}
            </button>
          </div>
          {resultadoImport && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
              <p>{resultadoImport.procesados} fila(s) importada(s) correctamente.</p>
              {resultadoImport.sectoresNoEncontrados.length > 0 && (
                <p className="text-amber-700">
                  Sectores sin coincidencia (quedaron sin asignar, corregilos en Dotación o creá el sector en Sectores):{" "}
                  {resultadoImport.sectoresNoEncontrados.join(", ")}
                </p>
              )}
              {resultadoImport.filasConError.length > 0 && (
                <p className="text-red-700">
                  {resultadoImport.filasConError.length} fila(s) con error:{" "}
                  {resultadoImport.filasConError.map((f) => `fila ${f.fila} (${f.motivo})`).join("; ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {mostrarForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Nuevo empleado</h3>
          <div className="grid grid-cols-4 gap-3">
            <input placeholder="Legajo *" value={nuevoEmpleado.legajo} onChange={(e) => setNuevoEmpleado({ ...nuevoEmpleado, legajo: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            <input placeholder="Apellido y Nombre *" value={nuevoEmpleado.apellidoNombre} onChange={(e) => setNuevoEmpleado({ ...nuevoEmpleado, apellidoNombre: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-sm col-span-2" />
            <input placeholder="DNI" value={nuevoEmpleado.dni} onChange={(e) => setNuevoEmpleado({ ...nuevoEmpleado, dni: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            <input type="date" placeholder="Fecha de Ingreso *" value={nuevoEmpleado.fechaIngreso} onChange={(e) => setNuevoEmpleado({ ...nuevoEmpleado, fechaIngreso: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            <select value={nuevoEmpleado.sectorId} onChange={(e) => setNuevoEmpleado({ ...nuevoEmpleado, sectorId: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
              <option value="">Sector...</option>
              {sectores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <input placeholder="Puesto" value={nuevoEmpleado.puesto} onChange={(e) => setNuevoEmpleado({ ...nuevoEmpleado, puesto: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            <select value={nuevoEmpleado.turno} onChange={(e) => setNuevoEmpleado({ ...nuevoEmpleado, turno: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
              <option value="">Turno...</option>
              {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={nuevoEmpleado.tipoContrato} onChange={(e) => setNuevoEmpleado({ ...nuevoEmpleado, tipoContrato: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
              <option value="">Contrato...</option>
              {CONTRATOS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={crearEmpleado}
            disabled={!nuevoEmpleado.legajo.trim() || !nuevoEmpleado.apellidoNombre.trim() || !nuevoEmpleado.fechaIngreso || guardando}
            className={`px-5 py-2 rounded-lg text-sm font-semibold ${
              !nuevoEmpleado.legajo.trim() || !nuevoEmpleado.apellidoNombre.trim() || !nuevoEmpleado.fechaIngreso || guardando
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {guardando ? "Guardando..." : "Guardar empleado"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">Total Dotación</div>
          <div className="text-2xl font-bold text-slate-800">{kpis.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">Activos</div>
          <div className="text-2xl font-bold text-green-700">{kpis.activos}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">En Licencia</div>
          <div className="text-2xl font-bold text-amber-700">{kpis.licencia}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">Bajas</div>
          <div className="text-2xl font-bold text-slate-500">{kpis.bajas}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Legajo, apellido o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm flex-1 min-w-[200px]"
        />
        <select value={filtroSector} onChange={(e) => setFiltroSector(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
          <option value="">Todos los sectores</option>
          {sectores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select value={filtroTurno} onChange={(e) => setFiltroTurno(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
          <option value="">Todos los turnos</option>
          {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
          <option value="">Todos los estados</option>
          {ESTADOS.map((es) => <option key={es} value={es}>{es}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        {cargando && empleados === null && <p className="p-6 text-sm text-slate-400">Cargando...</p>}
        {empleados !== null && filtrados.length === 0 && <p className="p-6 text-sm text-slate-400">Sin resultados.</p>}
        {empleados !== null && filtrados.length > 0 && (
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-slate-500 font-medium border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="py-2.5 px-3">Legajo</th>
                <th className="py-2.5 px-3">Apellido y Nombre</th>
                <th className="py-2.5 px-3">DNI</th>
                <th className="py-2.5 px-3">Fecha Ingreso</th>
                <th className="py-2.5 px-3">Antigüedad</th>
                <th className="py-2.5 px-3">Sector</th>
                <th className="py-2.5 px-3">Puesto</th>
                <th className="py-2.5 px-3">Turno</th>
                <th className="py-2.5 px-3">Contrato</th>
                <th className="py-2.5 px-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 px-3 text-slate-500">{e.legajo}</td>
                  <td className="py-2 px-3 font-semibold text-slate-800">{e.apellido_nombre}</td>
                  <td className="py-2 px-3 text-slate-500">{e.dni || "—"}</td>
                  <td className="py-2 px-3 text-slate-500">{e.fecha_ingreso}</td>
                  <td className="py-2 px-3 text-slate-500">{e.antiguedad}</td>
                  <td className="py-2 px-3">
                    <select
                      value={e.sector_id || ""}
                      onChange={(ev) => cambiarSector(e.id, ev.target.value)}
                      className="px-2 py-1 rounded border border-slate-300 text-xs bg-slate-50"
                    >
                      <option value="">Sin sector</option>
                      {sectores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3 text-slate-700">{e.puesto || "—"}</td>
                  <td className="py-2 px-3 text-slate-500">{e.turno || "—"}</td>
                  <td className="py-2 px-3 text-slate-500">{e.tipo_contrato || "—"}</td>
                  <td className="py-2 px-3">
                    <select
                      value={e.estado}
                      onChange={(ev) => cambiarEstado(e.id, ev.target.value)}
                      className={`px-2 py-1 rounded-full border-0 text-xs font-semibold ${estadoEstilo(e.estado)}`}
                    >
                      {ESTADOS.map((es) => <option key={es} value={es}>{es}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

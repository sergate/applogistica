"use client";

import { useEffect, useState } from "react";

interface PuestoFila {
  id: number;
  nombre: string;
  activo: boolean;
  empleados: number;
}

interface PuestoSinCrear {
  nombre: string;
  empleados: number;
}

// Lista maestra de puestos (se muestra dentro de Sectores, solo Administrador):
// alimenta el campo "Puesto" de Dotación. Arriba aparecen los puestos que ya están
// en uso en Dotación y todavía no se crearon, para crearlos con un clic.
export default function PuestosMaestro({ visible }: { visible: boolean }) {
  const [puestos, setPuestos] = useState<PuestoFila[] | null>(null);
  const [sinCrear, setSinCrear] = useState<PuestoSinCrear[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/puestos");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "No se pudieron cargar los puestos.");
      setPuestos(data.puestos);
      setSinCrear(data.sinCrear);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visible && puestos === null) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const llamar = async (url: string, metodo: string, cuerpo?: unknown) => {
    const res = await fetch(url, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "No se pudo completar la acción.");
    return data;
  };

  const ejecutar = async (accion: () => Promise<void>) => {
    setTrabajando(true);
    setError(null);
    try {
      await accion();
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setTrabajando(false);
    }
  };

  const crearPuesto = () =>
    ejecutar(async () => {
      if (!nombreNuevo.trim()) return;
      await llamar("/api/personal/puestos", "POST", { nombre: nombreNuevo.trim() });
      setNombreNuevo("");
    });

  const crearDesdeDotacion = (nombres: string[]) =>
    ejecutar(async () => {
      await llamar("/api/personal/puestos", "POST", { nombres });
    });

  const guardarNombre = (id: number) =>
    ejecutar(async () => {
      if (!nombreEdit.trim()) return;
      await llamar(`/api/personal/puestos/${id}`, "PATCH", { nombre: nombreEdit.trim() });
      setEditandoId(null);
    });

  const toggleActivo = (p: PuestoFila) =>
    ejecutar(async () => {
      await llamar(`/api/personal/puestos/${p.id}`, "PATCH", { activo: !p.activo });
    });

  const eliminar = (p: PuestoFila) => {
    if (p.empleados > 0) return;
    if (!confirm(`¿Borrar el puesto "${p.nombre}"?`)) return;
    return ejecutar(async () => {
      await llamar(`/api/personal/puestos/${p.id}`, "DELETE");
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold text-slate-800">Puestos</h2>
        <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Solo Administrador</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Lista maestra que alimenta el campo &quot;Puesto&quot; en Dotación. Si renombrás un puesto, los empleados que lo tienen pasan al
        nombre nuevo. No se puede borrar un puesto con empleados asignados.
      </p>

      {error && <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      {sinCrear.length > 0 && (
        <div className="mb-5 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
            <p className="text-sm text-amber-800">
              <b>{sinCrear.length}</b> puesto(s) ya aparecen en Dotación y todavía no están en esta lista:
            </p>
            <button
              onClick={() => crearDesdeDotacion(sinCrear.map((s) => s.nombre))}
              disabled={trabajando}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Crear todos
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sinCrear.map((s) => (
              <button
                key={s.nombre}
                onClick={() => crearDesdeDotacion([s.nombre])}
                disabled={trabajando}
                title="Crear este puesto"
                className="px-3 py-1 rounded-full text-xs font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                + {s.nombre} <span className="font-normal text-amber-600">({s.empleados})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Nombre del puesto nuevo"
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && crearPuesto()}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-72"
        />
        <button
          onClick={crearPuesto}
          disabled={!nombreNuevo.trim() || trabajando}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            !nombreNuevo.trim() || trabajando ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {trabajando ? "Guardando..." : "+ Agregar"}
        </button>
      </div>

      {cargando && puestos === null && <p className="text-sm text-slate-400">Cargando...</p>}
      {puestos !== null && puestos.length === 0 && <p className="text-sm text-slate-400">Todavía no hay puestos creados.</p>}

      {puestos !== null && puestos.length > 0 && (
        <table className="w-full text-sm text-left">
          <thead className="text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="py-2 px-3 text-left">Puesto</th>
              <th className="py-2 px-3 text-center">Empleados</th>
              <th className="py-2 px-3 text-center">Estado</th>
              <th className="py-2 px-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {puestos.map((p) => (
              <tr key={p.id}>
                <td className="py-2 px-3">
                  {editandoId === p.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={nombreEdit}
                      onChange={(e) => setNombreEdit(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && guardarNombre(p.id)}
                      className="px-2 py-1 rounded border border-blue-300 text-sm w-full"
                    />
                  ) : (
                    <span className={p.activo ? "text-slate-800" : "text-slate-400"}>{p.nombre}</span>
                  )}
                </td>
                <td className="py-2 px-3 text-center text-slate-500">{p.empleados}</td>
                <td className="py-2 px-3 text-center">
                  <button
                    onClick={() => toggleActivo(p)}
                    disabled={trabajando}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      p.activo ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.activo ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="py-2 px-3 text-right whitespace-nowrap">
                  {editandoId === p.id ? (
                    <>
                      <button onClick={() => guardarNombre(p.id)} className="text-blue-600 hover:underline text-sm font-semibold mr-3">
                        Guardar
                      </button>
                      <button onClick={() => setEditandoId(null)} className="text-slate-400 hover:underline text-sm">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditandoId(p.id);
                          setNombreEdit(p.nombre);
                        }}
                        className="text-slate-500 hover:underline text-sm mr-3"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminar(p)}
                        disabled={p.empleados > 0}
                        title={p.empleados > 0 ? "No se puede borrar: tiene empleados asignados" : "Eliminar puesto"}
                        className={`text-sm ${p.empleados > 0 ? "text-slate-300 cursor-not-allowed" : "text-red-600 hover:underline"}`}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

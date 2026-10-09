"use client";

import { useMemo, useState } from "react";
import { useTabData } from "@/hooks/useTabData";
import { SkeletonTable } from "@/components/Skeleton";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { fmtNum, fmtFecha } from "@/components/dashboard/formatters";

type Categoria = "rack" | "planes" | "picking";

interface EventoFila {
  id: number;
  fecha: string;
  tipo: string;
  categoria: Categoria;
  guia: string;
  contenedor: string;
  posicion: string;
  plan: string;
  resultado: "ok" | "error";
  mensaje: string;
  usuario: string;
}

interface EventosData {
  eventos: EventoFila[];
  diasAtras: number;
  truncado: boolean;
}

const ACCION: Record<string, string> = {
  registrar_posicion: "Guardó guía en rack",
  posicion_ya_registrada: "Reescaneó posición ya registrada",
  liberar_posicion: "Liberó posición",
  guia_despachada: "Guía despachada en WMS (posiciones liberadas)",
  crear_plan: "Creó plan de recogida",
  cancelar_plan: "Canceló plan de recogida",
  plan_completo: "Plan completo (guías retiradas)",
  recoger_posicion: "Pickeó posición",
};

const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  rack: "Guardado en rack",
  planes: "Planes de recogida",
  picking: "Picking",
};

const MAX_FILAS_VISIBLES = 500;

const claseSelect =
  "px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer";

// Registro de eventos de Pack and Hold (solo admin): quién guardó cada guía en
// el rack, cómo avanzaron los planes de recogida y quién pickeó cada posición.
export default function PHEventos() {
  const { activeTab, dataVersion } = useDashboard();

  const { data, error, isLoading } = useTabData<EventosData>(
    activeTab,
    "PH-Eventos",
    "/api/pack-hold/eventos",
    dataVersion
  );

  const [categoria, setCategoria] = useState<"TODAS" | Categoria>("TODAS");
  const [usuario, setUsuario] = useState("TODOS");
  const [resultado, setResultado] = useState("TODOS");
  const [periodo, setPeriodo] = useState("7");
  const [busqueda, setBusqueda] = useState("");
  // Hora de referencia de los períodos: se fija al abrir la pantalla.
  const [ahora] = useState(() => Date.now());

  const eventos = useMemo(() => data?.eventos ?? [], [data]);
  const usuarios = useMemo(() => [...new Set(eventos.map((e) => e.usuario))].sort(), [eventos]);
  const texto = busqueda.trim().toLowerCase();

  const filtrados = useMemo(() => {
    // "Hoy" = desde las 00:00 del día en este navegador; el resto, N días corridos hacia atrás.
    const corte =
      periodo === "0"
        ? new Date(new Date(ahora).setHours(0, 0, 0, 0)).getTime()
        : ahora - Number(periodo) * 24 * 60 * 60 * 1000;
    return eventos.filter(
      (e) =>
        new Date(e.fecha).getTime() >= corte &&
        (categoria === "TODAS" || e.categoria === categoria) &&
        (usuario === "TODOS" || e.usuario === usuario) &&
        (resultado === "TODOS" || e.resultado === resultado) &&
        (!texto ||
          e.guia.toLowerCase().includes(texto) ||
          e.contenedor.toLowerCase().includes(texto) ||
          e.posicion.toLowerCase().includes(texto) ||
          e.plan.toLowerCase().includes(texto) ||
          e.usuario.toLowerCase().includes(texto))
    );
  }, [eventos, categoria, usuario, resultado, periodo, texto, ahora]);

  const kpis = useMemo(
    () => ({
      total: filtrados.length,
      guardados: filtrados.filter((e) => e.tipo === "registrar_posicion" && e.resultado === "ok").length,
      pickeadas: filtrados.filter((e) => e.tipo === "recoger_posicion" && e.resultado === "ok").length,
      errores: filtrados.filter((e) => e.resultado === "error").length,
    }),
    [filtrados]
  );

  const hayFiltros = categoria !== "TODAS" || usuario !== "TODOS" || resultado !== "TODOS" || periodo !== "7" || texto !== "";

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const filas = filtrados.map((e) => ({
      "Fecha y hora": fmtFecha(e.fecha),
      Categoría: NOMBRE_CATEGORIA[e.categoria],
      Acción: ACCION[e.tipo] ?? e.tipo,
      Usuario: e.usuario,
      Guía: e.guia,
      Contenedor: e.contenedor,
      Posición: e.posicion,
      Plan: e.plan,
      Resultado: e.resultado === "ok" ? "OK" : "Error",
      Detalle: e.mensaje,
    }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Eventos");
    XLSX.writeFile(libro, `pack_and_hold_eventos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <h2 className="text-lg font-bold text-slate-800">Registro de eventos</h2>
          <button
            onClick={exportarExcel}
            disabled={filtrados.length === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtrados.length === 0
                ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Exportar a Excel
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-5">
          Quién guardó cada guía en el rack, cómo avanzaron los planes de recogida y quién pickeó cada posición. Se
          guardan los últimos {data?.diasAtras ?? 30} días.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { n: fmtNum(kpis.total), t: "Eventos" },
            { n: fmtNum(kpis.guardados), t: "Guías guardadas en rack" },
            { n: fmtNum(kpis.pickeadas), t: "Posiciones pickeadas" },
            { n: fmtNum(kpis.errores), t: "Errores" },
          ].map((k) => (
            <div key={k.t} className="border border-slate-200 rounded-lg px-4 py-3">
              <div className="text-2xl font-bold text-slate-900">{k.n}</div>
              <div className="text-xs text-slate-500">{k.t}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as "TODAS" | Categoria)}
            className={claseSelect}
            aria-label="Categoría"
          >
            <option value="TODAS">Todas las categorías</option>
            <option value="rack">{NOMBRE_CATEGORIA.rack}</option>
            <option value="planes">{NOMBRE_CATEGORIA.planes}</option>
            <option value="picking">{NOMBRE_CATEGORIA.picking}</option>
          </select>
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className={claseSelect} aria-label="Usuario">
            <option value="TODOS">Todos los usuarios</option>
            {usuarios.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <select value={resultado} onChange={(e) => setResultado(e.target.value)} className={claseSelect} aria-label="Resultado">
            <option value="TODOS">OK y errores</option>
            <option value="ok">Solo OK</option>
            <option value="error">Solo errores</option>
          </select>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={claseSelect} aria-label="Período">
            <option value="0">Hoy</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
          </select>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar guía, contenedor, posición, plan o usuario..."
            className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 border-none focus:ring-2 focus:ring-blue-500 w-80"
          />
          {hayFiltros && (
            <button
              onClick={() => {
                setCategoria("TODAS");
                setUsuario("TODOS");
                setResultado("TODOS");
                setPeriodo("7");
                setBusqueda("");
              }}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            Error al cargar: {error}
          </div>
        )}
        {data?.truncado && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
            Hay más eventos de los que se pueden mostrar: se cargaron los 5.000 más recientes.
          </div>
        )}
        {isLoading && !data && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
            <SkeletonTable rows={6} columns={8} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 font-medium border-b border-slate-200">
                <th className="py-3 px-4 text-left">Fecha y hora</th>
                <th className="py-3 px-4 text-left">Acción</th>
                <th className="py-3 px-4 text-left">Usuario</th>
                <th className="py-3 px-4 text-left">Guía</th>
                <th className="py-3 px-4 text-left">Contenedor</th>
                <th className="py-3 px-4 text-left">Posición</th>
                <th className="py-3 px-4 text-left">Plan</th>
                <th className="py-3 px-4 text-left">Resultado</th>
                <th className="py-3 px-4 text-left">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.slice(0, MAX_FILAS_VISIBLES).map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="py-2 px-4 text-left text-slate-600">{fmtFecha(e.fecha)}</td>
                  <td className="py-2 px-4 text-left text-slate-800 font-medium">{ACCION[e.tipo] ?? e.tipo}</td>
                  <td className="py-2 px-4 text-left text-slate-700">{e.usuario}</td>
                  <td className="py-2 px-4 text-left font-mono text-slate-700">{e.guia}</td>
                  <td className="py-2 px-4 text-left font-mono text-slate-600">{e.contenedor}</td>
                  <td className="py-2 px-4 text-left font-mono font-semibold text-slate-800">{e.posicion}</td>
                  <td className="py-2 px-4 text-left text-slate-700">{e.plan}</td>
                  <td className="py-2 px-4 text-left">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        e.resultado === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {e.resultado === "ok" ? "OK" : "Error"}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-left text-xs text-slate-500 max-w-md truncate" title={e.mensaje}>
                    {e.mensaje}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length === 0 && !isLoading && (
            <p className="text-sm text-slate-400 text-center py-8">No hay eventos con estos filtros.</p>
          )}
          {filtrados.length > MAX_FILAS_VISIBLES && (
            <p className="text-xs text-slate-400 text-center py-3">
              Se muestran los {MAX_FILAS_VISIBLES} más recientes de {fmtNum(filtrados.length)}. Acotá con los filtros o
              exportá a Excel para ver todos.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

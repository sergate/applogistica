import { supabaseAdmin } from "@/lib/supabaseClient";
import { fetchAllPaginated, fetchAllPaginatedIn } from "@/lib/fetchAllPaginated";
import { CICLO_INICIO_ISO } from "@/lib/personalVacacionesServer";

// Personal CD > Cupos Vacaciones: lo que comparten las rutas de la API.

/** "Operario" y "operario " son el mismo puesto. */
export const claveTexto = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Id que se usa para el grupo de empleados sin puesto (o con un puesto que no está en la lista maestra). */
export const SIN_PUESTO_ID = 0;

export interface EmpleadoUso {
  id: number;
  legajo: string;
  apellidoNombre: string;
  /** Id del puesto en la lista maestra, o SIN_PUESTO_ID. */
  puestoId: number;
  /** Días de vacaciones cargados por semana (clave: lunes de la semana, YYYY-MM-DD). Solo semanas con días > 0. */
  cargas: Map<string, number>;
}

/**
 * Los empleados que pueden tener vacaciones cargadas, con su puesto y sus días por
 * semana del ciclo vigente. Misma población que la pantalla Vacaciones: activos o en
 * licencia, sin eventuales (las bajas no ocupan cupo).
 */
export async function fetchEmpleadosConUso(puestos: { id: number; nombre: string }[]): Promise<EmpleadoUso[]> {
  const puestoIdPorClave = new Map(puestos.map((p) => [claveTexto(p.nombre), p.id]));

  const dotacion = await fetchAllPaginated<{
    id: number;
    legajo: string;
    apellido_nombre: string;
    puesto: string | null;
    estado: string;
    tipo_contrato: string | null;
  }>("personal_cd_dotacion", "id, legajo, apellido_nombre, puesto, estado, tipo_contrato");

  const empleados = dotacion.filter(
    (d) => (d.estado === "Activo" || d.estado === "Licencia") && d.tipo_contrato !== "Eventual"
  );

  const vacaciones = await fetchAllPaginatedIn<{ id: number; dotacion_id: number; ciclo_inicio: string }>(
    "personal_cd_vacaciones",
    "id, dotacion_id, ciclo_inicio",
    "dotacion_id",
    empleados.map((e) => e.id)
  );
  const vacacionesDelCiclo = vacaciones.filter((v) => v.ciclo_inicio === CICLO_INICIO_ISO);
  const vacacionesIdPorEmpleado = new Map(vacacionesDelCiclo.map((v) => [v.dotacion_id, v.id]));

  const cargas = await fetchAllPaginatedIn<{ vacaciones_id: number; semana_inicio: string; dias: number }>(
    "personal_cd_vacaciones_cargas",
    "vacaciones_id, semana_inicio, dias",
    "vacaciones_id",
    vacacionesDelCiclo.map((v) => v.id)
  );
  const cargasPorVacaciones = new Map<number, Map<string, number>>();
  for (const c of cargas) {
    const dias = Number(c.dias);
    if (!(dias > 0)) continue;
    const mapa = cargasPorVacaciones.get(c.vacaciones_id) ?? new Map<string, number>();
    mapa.set(c.semana_inicio, dias);
    cargasPorVacaciones.set(c.vacaciones_id, mapa);
  }

  return empleados.map((e) => {
    const vacacionesId = vacacionesIdPorEmpleado.get(e.id);
    return {
      id: e.id,
      legajo: e.legajo,
      apellidoNombre: e.apellido_nombre,
      puestoId: (e.puesto && puestoIdPorClave.get(claveTexto(e.puesto))) || SIN_PUESTO_ID,
      cargas: (vacacionesId !== undefined && cargasPorVacaciones.get(vacacionesId)) || new Map<string, number>(),
    };
  });
}

const MAX_PUESTOS_POR_TARJETA = 100;

/** Valida el array de ids de puestos de una tarjeta (que existan). Devuelve el mensaje de error o los ids. */
export async function validarPuestosIds(valor: unknown): Promise<{ error: string } | { ids: number[] }> {
  if (!Array.isArray(valor)) return { error: "Elegí los puestos de la tarjeta." };
  const ids = [...new Set(valor.map(Number))];
  if (ids.length > MAX_PUESTOS_POR_TARJETA || !ids.every((n) => Number.isInteger(n) && n > 0)) {
    return { error: "Los puestos de la tarjeta no son válidos." };
  }
  if (ids.length === 0) return { ids };

  const { data, error } = await supabaseAdmin.from("personal_cd_puestos").select("id").in("id", ids);
  if (error) throw new Error(`Supabase (personal_cd_puestos): ${error.message}`);
  if ((data || []).length !== ids.length) return { error: "Alguno de los puestos ya no existe." };
  return { ids };
}

/** Validación de una fecha YYYY-MM-DD que sea lunes. */
export function esLunesISO(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor && d.getUTCDay() === 1;
}

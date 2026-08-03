import { supabaseAdmin } from "@/lib/supabaseClient";
import { getCached } from "@/lib/queryCache";

const ALMACEN_TTL_MS = 20_000;

export interface AlmacenLayoutRow {
  nave: string | null;
  ubicacion: string;
  zona: string;
}

// Mapeo exacto de los valores de "Zona" que trae el layout real a
// (grupo, sub-fila) mostrados en Ocupación Almacén - Resumen. Es la única
// lógica de clasificación: si aparece un valor de Zona nuevo que no está
// acá, cae en el grupo "Sin clasificar" (no se pierde ni rompe nada) y se
// agrega una línea nueva a este mapa.
const MAPA_ZONAS: Record<string, { grupo: string; subzona: string }> = {
  "RACK NAVE 2": { grupo: "Pallet", subzona: "NAVE 2" },
  "RACK AWADA": { grupo: "Pallet", subzona: "NAVE 3" },
  "MZN CAL 3": { grupo: "Calzado", subzona: "MZN PISO 3" },
  "MZN IND 1": { grupo: "Indumentaria", subzona: "MZN PISO 1" },
  "MZN IND 2": { grupo: "Indumentaria", subzona: "MZN PISO 2" },
  "MZN IND 3": { grupo: "Indumentaria", subzona: "MZN PISO 3" },
  "MZN IND 4": { grupo: "Indumentaria", subzona: "MZN PISO 4" },
  "PALLET F01": { grupo: "Indumentaria", subzona: "PALLET F01" },
  "PERCHERO AWADA": { grupo: "AWADA", subzona: "PERCHEROS" },
  "PICKING AWADA": { grupo: "AWADA", subzona: "PICKING" },
};

/**
 * Clasifica una fila del layout (según su "Zona", tal como viene del Excel)
 * en el grupo y la sub-fila que se muestran en Ocupación Almacén - Resumen.
 */
export function clasificarZonaAlmacen(zonaRaw: string): { grupo: string; subzona: string } {
  const zona = (zonaRaw || "").trim().toUpperCase();
  return MAPA_ZONAS[zona] ?? { grupo: "Sin clasificar", subzona: zonaRaw.trim() || "SIN ZONA" };
}

/** Trae TODO el layout del almacén (paginado, Supabase pagina de a 1000). */
export async function fetchAlmacenLayout(): Promise<AlmacenLayoutRow[]> {
  return getCached("almacen_layout:all", ALMACEN_TTL_MS, async () => {
    const PAGE_SIZE = 1000;
    let from = 0;
    const all: AlmacenLayoutRow[] = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("almacen_layout")
        .select("nave, ubicacion, zona")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`Supabase (almacen_layout): ${error.message}`);
      if (!data || data.length === 0) break;

      all.push(...(data as AlmacenLayoutRow[]));

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return all;
  });
}

export interface AlmacenOcupacionInfo {
  ubicacionesOcupadas: Set<string>;
  updatedAt: string | null;
}

/**
 * Trae la "tabla dinámica" ya limpia (ubicacion/contenedor/unidades, una
 * fila por combinación única con stock>0) y la reduce a las ubicaciones
 * ocupadas -- cualquier ubicación con al menos una fila acá ya cuenta como
 * ocupada, no hace falta mirar "unidades" de nuevo.
 */
export async function fetchAlmacenOcupacion(): Promise<AlmacenOcupacionInfo> {
  return getCached("almacen_ocupacion:all", ALMACEN_TTL_MS, async () => {
    const PAGE_SIZE = 1000;
    let from = 0;
    const ubicacionesOcupadas = new Set<string>();
    let updatedAt: string | null = null;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("almacen_ocupacion")
        .select("ubicacion, actualizado_at")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`Supabase (almacen_ocupacion): ${error.message}`);
      if (!data || data.length === 0) break;

      for (const row of data) {
        ubicacionesOcupadas.add(row.ubicacion as string);
        const actualizadoAt = row.actualizado_at as string | null;
        if (actualizadoAt && (!updatedAt || actualizadoAt > updatedAt)) updatedAt = actualizadoAt;
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return { ubicacionesOcupadas, updatedAt };
  });
}

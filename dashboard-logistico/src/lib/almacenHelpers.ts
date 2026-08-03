import { supabaseAdmin } from "@/lib/supabaseClient";
import { getCached } from "@/lib/queryCache";

const ALMACEN_TTL_MS = 20_000;

export interface AlmacenLayoutRow {
  nave: string | null;
  ubicacion: string;
  zona: string;
}

/**
 * Clasifica una fila del layout (nave + zona, tal como vienen del Excel) en
 * el grupo y la sub-fila que se muestran en Ocupación Almacén - Resumen.
 * Es la única función con esta lógica: si algún valor real de "Zona" no cae
 * en el grupo correcto, se ajusta acá y se recalcula solo (el layout se
 * guarda crudo, sin la clasificación).
 */
export function clasificarZonaAlmacen(nave: string | null, zonaRaw: string): { grupo: string; subzona: string } {
  const zona = (zonaRaw || "").toUpperCase();

  if (zona.includes("AWADA")) {
    const subzona = zona.includes("PERCHER") ? "PERCHEROS" : zona.includes("PICKING") ? "PICKING" : zonaRaw.trim();
    return { grupo: "AWADA", subzona };
  }
  if (zona.includes("CALZADO")) {
    const piso = zona.match(/PISO\s*\d+/);
    return { grupo: "Calzado", subzona: piso ? `MZN ${piso[0]}` : zonaRaw.trim() };
  }
  if (zona.includes("INDUMENTARIA")) {
    const piso = zona.match(/PISO\s*\d+/);
    if (piso) return { grupo: "Indumentaria", subzona: `MZN ${piso[0]}` };
    if (zona.includes("PALLET")) return { grupo: "Indumentaria", subzona: "PALLET F01" };
    return { grupo: "Indumentaria", subzona: zonaRaw.trim() };
  }
  // Todo lo que no matchea AWADA/Calzado/Indumentaria se asume Pallet, agrupado por nave.
  return { grupo: "Pallet", subzona: nave ? `NAVE ${nave}` : zonaRaw.trim() || "SIN NAVE" };
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

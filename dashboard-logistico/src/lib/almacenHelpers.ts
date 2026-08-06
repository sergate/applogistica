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

/** Catálogo fijo de (grupo, subzona) posibles -- se arma solo, a partir de MAPA_ZONAS. */
export const CATALOGO_ZONAS_ALMACEN: { grupo: string; subzona: string }[] = Array.from(
  new Map(Object.values(MAPA_ZONAS).map((z) => [`${z.grupo}__${z.subzona}`, z])).values()
);

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
  contenedoresPorUbicacion: Map<string, number>;
  updatedAt: string | null;
}

/**
 * Trae la "tabla dinámica" ya limpia (ubicacion/contenedor/unidades, una
 * fila por combinación única con stock>0) y la reduce a la cantidad de
 * contenedores únicos por ubicación -- la ocupación de una zona es la suma
 * de esos contenedores en todas las posiciones que le pertenecen (no solo
 * si la posición tiene o no algo).
 */
export async function fetchAlmacenOcupacion(): Promise<AlmacenOcupacionInfo> {
  return getCached("almacen_ocupacion:all", ALMACEN_TTL_MS, async () => {
    const PAGE_SIZE = 1000;
    let from = 0;
    const contenedoresPorUbicacion = new Map<string, number>();
    let updatedAt: string | null = null;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("almacen_ocupacion")
        .select("ubicacion, actualizado_at")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`Supabase (almacen_ocupacion): ${error.message}`);
      if (!data || data.length === 0) break;

      for (const row of data) {
        const ubicacion = row.ubicacion as string;
        contenedoresPorUbicacion.set(ubicacion, (contenedoresPorUbicacion.get(ubicacion) ?? 0) + 1);
        const actualizadoAt = row.actualizado_at as string | null;
        if (actualizadoAt && (!updatedAt || actualizadoAt > updatedAt)) updatedAt = actualizadoAt;
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return { contenedoresPorUbicacion, updatedAt };
  });
}

/**
 * Trae, para cada contenedor de la última importación de ocupación, en qué
 * ubicación del almacén está (usado por Seguimiento Urgencias para mostrar
 * la posición de cada contenedor cargado). Si un contenedor aparece en más
 * de una ubicación (no debería, pero el archivo de origen es enorme), se
 * queda con la primera que encuentra.
 */
export async function fetchPosicionesPorContenedor(): Promise<Map<string, string>> {
  return getCached("almacen_ocupacion:posiciones", ALMACEN_TTL_MS, async () => {
    const PAGE_SIZE = 1000;
    let from = 0;
    const posicionesPorContenedor = new Map<string, string>();

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("almacen_ocupacion")
        .select("contenedor, ubicacion")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`Supabase (almacen_ocupacion): ${error.message}`);
      if (!data || data.length === 0) break;

      for (const row of data) {
        const contenedor = row.contenedor as string;
        if (!posicionesPorContenedor.has(contenedor)) {
          posicionesPorContenedor.set(contenedor, row.ubicacion as string);
        }
      }

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return posicionesPorContenedor;
  });
}

export interface AlmacenResumenFilaAgregada {
  grupo: string;
  subzona: string;
  capacidad: number;
  ocupadas: number;
}

export interface AlmacenResumenAgregado {
  filas: AlmacenResumenFilaAgregada[];
  updatedAt: string | null;
}

/**
 * Versión rápida de "traer todo y agrupar en JS": la agregación por
 * (grupo, subzona) se hace directamente en Postgres vía la función
 * `almacen_resumen_agrupado()` (ver sql/almacen_resumen_agrupado.sql), en vez
 * de paginar almacen_layout + almacen_ocupacion completas (esta última tiene
 * cientos de miles de filas) a memoria. El "updatedAt" se pide aparte con un
 * `order + limit 1`, mucho más liviano que traer la tabla entera solo para
 * sacar el máximo.
 */
export async function fetchAlmacenResumenAgregado(): Promise<AlmacenResumenAgregado> {
  return getCached("almacen_resumen:agregado", ALMACEN_TTL_MS, async () => {
    const [rpcResult, ultimaFila] = await Promise.all([
      supabaseAdmin.rpc("almacen_resumen_agrupado"),
      supabaseAdmin
        .from("almacen_ocupacion")
        .select("actualizado_at")
        .order("actualizado_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (rpcResult.error) throw new Error(`Supabase (almacen_resumen_agrupado): ${rpcResult.error.message}`);
    if (ultimaFila.error) throw new Error(`Supabase (almacen_ocupacion): ${ultimaFila.error.message}`);

    return {
      filas: (rpcResult.data ?? []) as AlmacenResumenFilaAgregada[],
      updatedAt: (ultimaFila.data?.actualizado_at as string | undefined) ?? null,
    };
  });
}

/**
 * Trae qué (grupo, subzona) están deshabilitados para mostrarse en
 * Ocupación Almacén - Resumen (panel Configuración). Por default, todo lo
 * que no está en esta tabla está habilitado -- solo se guardan las
 * excepciones que alguien apagó a mano.
 */
export async function fetchAlmacenIndicadoresDeshabilitados(): Promise<Set<string>> {
  return getCached("almacen_indicadores:deshabilitados", ALMACEN_TTL_MS, async () => {
    const { data, error } = await supabaseAdmin
      .from("almacen_indicadores_config")
      .select("grupo, subzona")
      .eq("habilitado", false);

    if (error) throw new Error(`Supabase (almacen_indicadores_config): ${error.message}`);

    return new Set((data ?? []).map((r) => `${r.grupo}__${r.subzona}`));
  });
}

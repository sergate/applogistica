import { supabaseAdmin } from "@/lib/supabaseClient";

const PAGE_SIZE = 1000;

/**
 * Trae todas las filas de una tabla (Supabase pagina de a 1000 filas por
 * default). Primero pide el total de filas y después dispara todas las
 * páginas EN PARALELO en vez de una por una -- con tablas de varios miles
 * de filas esto evita decenas de round-trips secuenciales a Supabase cada
 * vez que vence el caché corto (getCached) de los distintos módulos.
 */
export async function fetchAllPaginated<T>(table: string, columns: string): Promise<T[]> {
  const { count, error: countError } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true });

  if (countError) {
    throw new Error(`Supabase (${table}): ${countError.message}`);
  }
  if (!count) return [];

  const starts: number[] = [];
  for (let from = 0; from < count; from += PAGE_SIZE) starts.push(from);

  const paginas = await Promise.all(
    starts.map(async (from) => {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(columns)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`Supabase (${table}): ${error.message}`);
      }
      return (data ?? []) as T[];
    })
  );

  return paginas.flat();
}

/**
 * Igual que fetchAllPaginated, pero para "traer todas las filas donde
 * <column> esté en <ids>" en vez de la tabla entera -- mismo problema del
 * límite de 1000 filas de Supabase, pero acá el total puede superarlo aunque
 * la tabla en sí no sea gigante, con solo pedir varios ids a la vez (ej. los
 * bultos de varias Hojas de Ruta juntas). ids vacío devuelve [] sin pegarle
 * a Supabase.
 */
export async function fetchAllPaginatedIn<T>(
  table: string,
  columns: string,
  column: string,
  ids: (string | number)[]
): Promise<T[]> {
  if (ids.length === 0) return [];

  const { count, error: countError } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, ids);

  if (countError) {
    throw new Error(`Supabase (${table}): ${countError.message}`);
  }
  if (!count) return [];

  const starts: number[] = [];
  for (let from = 0; from < count; from += PAGE_SIZE) starts.push(from);

  const paginas = await Promise.all(
    starts.map(async (from) => {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(columns)
        .in(column, ids)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`Supabase (${table}): ${error.message}`);
      }
      return (data ?? []) as T[];
    })
  );

  return paginas.flat();
}

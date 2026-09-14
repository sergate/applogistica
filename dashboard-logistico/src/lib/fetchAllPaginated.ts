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

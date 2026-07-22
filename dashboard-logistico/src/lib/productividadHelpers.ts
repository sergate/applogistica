import { supabaseAdmin } from "@/lib/supabaseClient";

export interface ProductividadRow {
  fecha: string;
  tipo_proceso: string | null;
  cantidad: number | null;
  created_at: string | null;
}

/**
 * Normaliza el tipo de proceso tal como se muestra/agrupa en toda la app:
 * "INGRESO" se excluye por completo, y "DEVOLUCIONES"/"SEPARACION" se
 * fusionan en "REMANENTES". Devuelve null cuando la fila debe descartarse.
 */
export function mapearTipoProceso(tipo: string): string | null {
  const t = tipo.trim().toUpperCase();
  if (t === "INGRESO") return null;
  if (t === "DEVOLUCIONES" || t === "SEPARACION") return "REMANENTES";
  return t;
}

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas.
export async function fetchAllProductividad(): Promise<ProductividadRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: ProductividadRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("productividad")
      .select("fecha, tipo_proceso, cantidad, created_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (productividad): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...(data as ProductividadRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

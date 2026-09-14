import { getCached } from "@/lib/queryCache";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

const PRODUCTIVIDAD_TTL_MS = 20_000;

export interface ProductividadRow {
  fecha: string;
  tipo_proceso: string | null;
  cantidad: number | null;
  usuario: string | null;
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

export async function fetchAllProductividad(): Promise<ProductividadRow[]> {
  return getCached("productividad:all", PRODUCTIVIDAD_TTL_MS, () =>
    fetchAllPaginated<ProductividadRow>("productividad", "fecha, tipo_proceso, cantidad, usuario, created_at")
  );
}

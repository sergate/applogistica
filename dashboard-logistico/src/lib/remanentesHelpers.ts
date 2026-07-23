import { supabaseAdmin } from "@/lib/supabaseClient";

export interface RemanenteRow {
  numero: string;
  grupo: string | null;
  pedidas: number | null;
  distribuidas: number | null;
  pendientes: number | null;
  stock_total: number | null;
  created_at: string | null;
}

// -----------------------------------------------------------------------
// El "numero" trae tokens sueltos separados por espacios/guiones, ej:
// "CI- 1 CQ REMA VER PRENDAS 29-05 - 1293"
// CQ/CHK/AW = marca | VER/INV = temporada | REMA = marca que el archivo
// es de remanentes (si NO aparece, la fila no cuenta para esta sección).
// -----------------------------------------------------------------------
const MARCA_CODES: Record<string, string> = {
  CQ: "CQQTQ",
  CHK: "CHEEKY",
  AW: "AWADA",
};
const TEMPORADA_CODES: Record<string, string> = {
  VER: "VERANO",
  INV: "INVIERNO",
};

export function parseNumeroRemanente(numero: string): { marca: string; temporada: string; esRemanente: boolean } {
  const tokens = numero.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let marca = "SIN MARCA";
  let temporada = "SIN TEMPORADA";
  let esRemanente = false;

  for (const t of tokens) {
    if (MARCA_CODES[t]) marca = MARCA_CODES[t];
    if (TEMPORADA_CODES[t]) temporada = TEMPORADA_CODES[t];
    if (t === "REMA") esRemanente = true;
  }

  return { marca, temporada, esRemanente };
}

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas.
export async function fetchAllRemanentes(): Promise<RemanenteRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: RemanenteRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("remanentes")
      .select("numero, grupo, pedidas, distribuidas, pendientes, stock_total, created_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (remanentes): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...(data as RemanenteRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

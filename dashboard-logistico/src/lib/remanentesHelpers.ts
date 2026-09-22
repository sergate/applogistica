import { getCached } from "@/lib/queryCache";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

// Ver el mismo comentario en resumenHelpers.ts (MAESTROS_TTL_MS).
const REMANENTES_TTL_MS = 120_000;

export interface RemanenteRow {
  numero: string;
  grupo: string | null;
  pedidas: number | null;
  distribuidas: number | null;
  pendientes: number | null;
  stock_total: number | null;
  sku: string | null;
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

export async function fetchAllRemanentes(): Promise<RemanenteRow[]> {
  return getCached("remanentes:all", REMANENTES_TTL_MS, () =>
    fetchAllPaginated<RemanenteRow>(
      "remanentes",
      "numero, grupo, pedidas, distribuidas, pendientes, stock_total, sku, created_at"
    )
  );
}

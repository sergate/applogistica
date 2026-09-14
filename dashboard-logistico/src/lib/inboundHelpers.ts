import { getCached } from "@/lib/queryCache";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

const INBOUND_TTL_MS = 20_000;

export interface InboundRow {
  legajo: number;
  proveedor: string | null;
  etapa: string | null;
  marca: string | null;
  unidades: number | null;
  fob_total_usd: number | null;
  transporte: string | null;
  tipo_carga: string | null;
  bultos: string | null;
  cbm: string | null;
  etd: string | null;
  eta: string | null;
  arribo_cd: string | null;
  status: string | null;
  updated_at: string | null;
}

export async function fetchAllInbound(): Promise<InboundRow[]> {
  return getCached("inbound:all", INBOUND_TTL_MS, () =>
    fetchAllPaginated<InboundRow>(
      "inbound",
      "legajo, proveedor, etapa, marca, unidades, fob_total_usd, transporte, tipo_carga, bultos, cbm, etd, eta, arribo_cd, status, updated_at"
    )
  );
}

export function esStatusCD(status: string | null): boolean {
  return (status || "").trim().toUpperCase() === "CD";
}

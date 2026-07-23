import { supabaseAdmin } from "@/lib/supabaseClient";

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

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas.
export async function fetchAllInbound(): Promise<InboundRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: InboundRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("inbound")
      .select("legajo, proveedor, etapa, marca, unidades, fob_total_usd, transporte, tipo_carga, bultos, cbm, etd, eta, arribo_cd, status, updated_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (inbound): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...(data as InboundRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

export function esStatusCD(status: string | null): boolean {
  return (status || "").trim().toUpperCase() === "CD";
}

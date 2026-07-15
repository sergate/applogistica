import { supabaseAdmin } from "@/lib/supabaseClient";

// Grupos que NO cuentan para los cálculos de Status de Preparación
// (son materiales de vidriera/empaque/packaging/promoción, no unidades de venta)
export const GRUPOS_EXCLUIDOS = ["VIDRIERA", "MATERIALES EMPAQUE", "PACKAGING", "PROMOCION"];

// Pedidos con este estado tampoco cuentan para los cálculos (ya están cerrados)
export const ESTADOS_EXCLUIDOS = ["OD_TERMINADO"];

export interface GrupoPedidoRow {
  pedido: string;
  grupo: string | null;
  seller: string | null;
  estado_pedido: string | null;
  uni: number | null;
  uni_pick: number | null;
  uni_sep: number | null;
}

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas.
export async function fetchAllGrupoPedidos(): Promise<GrupoPedidoRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: GrupoPedidoRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("grupo_pedidos")
      .select("pedido, grupo, seller, estado_pedido, uni, uni_pick, uni_sep")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (grupo_pedidos): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...(data as GrupoPedidoRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

export function esGrupoContable(grupo: string | null): boolean {
  if (!grupo) return true;
  return !GRUPOS_EXCLUIDOS.includes(grupo.trim().toUpperCase());
}

export function esEstadoContable(estado: string | null): boolean {
  if (!estado) return true;
  return !ESTADOS_EXCLUIDOS.includes(estado.trim().toUpperCase());
}

export function esContable(row: GrupoPedidoRow): boolean {
  return esGrupoContable(row.grupo) && esEstadoContable(row.estado_pedido);
}

export const num = (v: number | null): number => Number(v) || 0;

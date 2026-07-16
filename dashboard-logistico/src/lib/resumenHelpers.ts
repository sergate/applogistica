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
  fecha_creacion: string | null;
  updated_at: string | null;
}

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas.
export async function fetchAllGrupoPedidos(): Promise<GrupoPedidoRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: GrupoPedidoRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("grupo_pedidos")
      .select("pedido, grupo, seller, estado_pedido, uni, uni_pick, uni_sep, fecha_creacion, updated_at")
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

/** Devuelve el updated_at más reciente entre todas las filas (o null si no hay filas). */
export function ultimaActualizacion(rows: GrupoPedidoRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    if (r.updated_at && (!max || r.updated_at > max)) {
      max = r.updated_at;
    }
  }
  return max;
}

/**
 * Trae TODA la tabla tiendas_destino, paginada (Supabase corta en 1000 filas
 * por default si no se pagina explícitamente -con .in() en lotes esto se
 * podía superar y perder filas en silencio-). Devuelve un mapa
 * pedido -> lista de códigos de tienda asociados a ese pedido.
 */
export async function fetchTiendasPorPedido(): Promise<Map<string, string[]>> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const map = new Map<string, string[]>();

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("tiendas_destino")
      .select("pedido, tiendas_destino")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (tiendas_destino): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const codigoTienda = row.tiendas_destino as string | null;
      if (!codigoTienda) continue;
      if (!map.has(row.pedido)) map.set(row.pedido, []);
      map.get(row.pedido)!.push(codigoTienda);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return map;
}

/** Trae toda la tabla clientes y arma un mapa código de tienda -> canal. */
export async function fetchCanalPorCodigoTienda(): Promise<Map<string, string>> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const map = new Map<string, string>();

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .select("codigo, canal")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (clientes): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.codigo) map.set(row.codigo, (row.canal as string | null) || "SIN CANAL");
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return map;
}

/**
 * Dado un pedido y los mapas de tiendas/canales, prueba todos los códigos de
 * tienda del pedido hasta encontrar uno que exista en "clientes". No asume
 * que la primera fila devuelta sea la "correcta" (Supabase no garantiza
 * orden sin ORDER BY explícito).
 */
export function resolverCanal(
  pedido: string,
  tiendasPorPedido: Map<string, string[]>,
  canalPorCodigo: Map<string, string>
): string {
  const codigosTienda = tiendasPorPedido.get(pedido) ?? [];
  for (const codigoTienda of codigosTienda) {
    const match = canalPorCodigo.get(codigoTienda);
    if (match) return match;
  }
  return "SIN CANAL";
}

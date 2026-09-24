import { supabaseAdmin } from "@/lib/supabaseClient";
import { getCached } from "@/lib/queryCache";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

// Los "maestros" (grupo_pedidos, tiendas_destino, clientes) los piden
// completos y sin filtrar varias rutas distintas en la misma ventana de
// tiempo (Resumen, Por Fecha, Por Pedidos, Por Canal...). Cachearlos evita
// traer la tabla entera de vuelta y volver a agregarla en cada request --
// se invalida a mano en /api/import-maestros apenas se reimporta alguno,
// así que un TTL más largo no muestra datos más viejos que eso, solo evita
// recalcular de más mientras alguien navega el dashboard (el recálculo de
// miles de filas en JS es la parte que más pesa en "Fluid Active CPU").
const MAESTROS_TTL_MS = 120_000;

// Grupos que NO cuentan para los cálculos de Status de Preparación
// (son materiales de vidriera/empaque/packaging/promoción, no unidades de venta)
export const GRUPOS_EXCLUIDOS = ["VIDRIERA", "MATERIALES EMPAQUE", "PACKAGING", "PROMOCION"];

// Pedidos con este estado tampoco cuentan para los cálculos (ya están cerrados)
export const ESTADOS_EXCLUIDOS = ["OD_TERMINADO"];

// "rema" tiene que aparecer como palabra suelta (separada por espacios,
// guiones, etc.), no como substring de otra palabra -- un simple .includes()
// clasificaba como REMA a cualquier nombre que contuviera "rema" en el medio
// (ej. cliente "SREMAC MARIA JULIETA").
const REGEX_PALABRA_REMA = /\brema\b/i;

/** Si el "Nombre pedido" contiene "rema" como palabra suelta es REMA, si no STD. */
export function tipoPedidoDeNombre(nombrePedido: string | null): "REMA" | "STD" {
  return REGEX_PALABRA_REMA.test(nombrePedido || "") ? "REMA" : "STD";
}

/**
 * Igual que tipoPedidoDeNombre, pero además fuerza REMA para cualquier
 * pedido cargado a mano en "pedidos_rema_manual" (panel Status de
 * Preparación / Pedidos REMA Manual) aunque su nombre no contenga "rema".
 * Deja de contar como REMA en cuanto se borra de esa lista.
 */
export function tipoPedido(
  pedido: string,
  nombrePedido: string | null,
  pedidosRemaManual: Set<string>
): "REMA" | "STD" {
  if (pedidosRemaManual.has(pedido)) return "REMA";
  return tipoPedidoDeNombre(nombrePedido);
}

/** Trae todos los códigos de pedido cargados a mano como REMA. */
export async function fetchPedidosRemaManual(): Promise<Set<string>> {
  return getCached("pedidos_rema_manual:all", MAESTROS_TTL_MS, async () => {
    const { data, error } = await supabaseAdmin.from("pedidos_rema_manual").select("pedido");
    if (error) {
      throw new Error(`Supabase (pedidos_rema_manual): ${error.message}`);
    }
    return new Set((data ?? []).map((r) => r.pedido as string));
  });
}

export interface GrupoPedidoRow {
  pedido: string;
  grupo: string | null;
  seller: string | null;
  estado_pedido: string | null;
  nombre_pedido: string | null;
  uni: number | null;
  uni_pick: number | null;
  uni_sep: number | null;
  fecha_creacion: string | null;
  updated_at: string | null;
}

export async function fetchAllGrupoPedidos(): Promise<GrupoPedidoRow[]> {
  return getCached("grupo_pedidos:all", MAESTROS_TTL_MS, () =>
    fetchAllPaginated<GrupoPedidoRow>(
      "grupo_pedidos",
      "pedido, grupo, seller, estado_pedido, nombre_pedido, uni, uni_pick, uni_sep, fecha_creacion, updated_at"
    )
  );
}

export function esGrupoContable(grupo: string | null): boolean {
  if (!grupo) return true;
  return !GRUPOS_EXCLUIDOS.includes(grupo.trim().toUpperCase());
}

export function esEstadoContable(estado: string | null, incluirTerminados = false): boolean {
  if (incluirTerminados) return true;
  if (!estado) return true;
  return !ESTADOS_EXCLUIDOS.includes(estado.trim().toUpperCase());
}

export function esContable(row: GrupoPedidoRow, incluirTerminados = false): boolean {
  return esGrupoContable(row.grupo) && esEstadoContable(row.estado_pedido, incluirTerminados);
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

export interface TiendaDestinoRow {
  pedido: string;
  tiendas_destino: string | null;
  nombre_pedido: string | null;
  seller: string | null;
  estado_pedido: string | null;
  uni: number | null;
  uni_pick: number | null;
  uni_sep: number | null;
  fecha_creacion: string | null;
}

/** Trae TODA la tabla tiendas_destino con todas sus columnas de datos (paginado). */
export async function fetchAllTiendasDestino(): Promise<TiendaDestinoRow[]> {
  return getCached("tiendas_destino:all", MAESTROS_TTL_MS, () =>
    fetchAllPaginated<TiendaDestinoRow>(
      "tiendas_destino",
      "pedido, tiendas_destino, nombre_pedido, seller, estado_pedido, uni, uni_pick, uni_sep, fecha_creacion"
    )
  );
}

export interface ClienteInfo {
  nombre: string;
  canal: string;
}

/** Trae toda la tabla clientes y arma un mapa código -> {nombre, canal}. */
export async function fetchClientesInfo(): Promise<Map<string, ClienteInfo>> {
  return getCached("clientes:info", MAESTROS_TTL_MS, async () => {
    const rows = await fetchAllPaginated<{ codigo: string | null; nombre: string | null; canal: string | null }>(
      "clientes",
      "codigo, nombre, canal"
    );

    const map = new Map<string, ClienteInfo>();
    for (const row of rows) {
      if (row.codigo) {
        map.set(row.codigo, {
          nombre: row.nombre || "SIN NOMBRE",
          canal: row.canal || "SIN CANAL",
        });
      }
    }
    return map;
  });
}

/**
 * Trae TODA la tabla tiendas_destino, paginada (Supabase corta en 1000 filas
 * por default si no se pagina explícitamente -con .in() en lotes esto se
 * podía superar y perder filas en silencio-). Devuelve un mapa
 * pedido -> lista de códigos de tienda asociados a ese pedido.
 */
export async function fetchTiendasPorPedido(): Promise<Map<string, string[]>> {
  return getCached("tiendas_destino:por_pedido", MAESTROS_TTL_MS, async () => {
    const rows = await fetchAllPaginated<{ pedido: string; tiendas_destino: string | null }>(
      "tiendas_destino",
      "pedido, tiendas_destino"
    );

    const map = new Map<string, string[]>();
    for (const row of rows) {
      const codigoTienda = row.tiendas_destino;
      if (!codigoTienda) continue;
      if (!map.has(row.pedido)) map.set(row.pedido, []);
      map.get(row.pedido)!.push(codigoTienda);
    }
    return map;
  });
}

/** Trae toda la tabla clientes y arma un mapa código de tienda -> canal. */
export async function fetchCanalPorCodigoTienda(): Promise<Map<string, string>> {
  return getCached("clientes:canal_por_codigo", MAESTROS_TTL_MS, async () => {
    const rows = await fetchAllPaginated<{ codigo: string | null; canal: string | null }>(
      "clientes",
      "codigo, canal"
    );

    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.codigo) map.set(row.codigo, row.canal || "SIN CANAL");
    }
    return map;
  });
}

/**
 * Trae despacho_grupos_clientes_miembros + despacho_grupos_clientes(nombre)
 * y arma un mapa código de tienda -> lista de nombres de grupo. Un cliente
 * puede estar en varios grupos a la vez (ej. "Franquicias 1" y "Miércoles
 * Propios"), por eso el valor es un array -- mismo join que ya usa
 * /api/despacho/guias.
 */
export async function fetchGruposClientesPorCodigo(): Promise<Map<string, string[]>> {
  return getCached("despacho_grupos_clientes:por_codigo", MAESTROS_TTL_MS, async () => {
    const rows = await fetchAllPaginated<{
      codigo_cliente: string;
      despacho_grupos_clientes: { nombre: string } | { nombre: string }[] | null;
    }>("despacho_grupos_clientes_miembros", "codigo_cliente, despacho_grupos_clientes(nombre)");

    const map = new Map<string, string[]>();
    for (const row of rows) {
      const grupo = Array.isArray(row.despacho_grupos_clientes)
        ? row.despacho_grupos_clientes[0]
        : row.despacho_grupos_clientes;
      const nombre = grupo?.nombre;
      if (!nombre) continue;
      if (!map.has(row.codigo_cliente)) map.set(row.codigo_cliente, []);
      map.get(row.codigo_cliente)!.push(nombre);
    }
    return map;
  });
}

/**
 * Dado un pedido, prueba todos sus códigos de tienda hasta encontrar uno
 * que exista en "clientes", y devuelve el código de tienda + nombre + canal
 * juntos. No asume que la primera fila devuelta por Supabase sea la
 * "correcta" (no hay ORDER BY garantizado).
 */
export function resolverTiendaCliente(
  pedido: string,
  tiendasPorPedido: Map<string, string[]>,
  clientesInfo: Map<string, ClienteInfo>
): { codigoTienda: string; nombre: string; canal: string } {
  const codigos = tiendasPorPedido.get(pedido) ?? [];
  for (const codigo of codigos) {
    const info = clientesInfo.get(codigo);
    if (info) return { codigoTienda: codigo, nombre: info.nombre, canal: info.canal };
  }
  return {
    codigoTienda: codigos[0] || "SIN TIENDA",
    nombre: "SIN CLIENTE",
    canal: "SIN CANAL",
  };
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

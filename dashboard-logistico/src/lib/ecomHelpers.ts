import { supabaseAdmin } from "@/lib/supabaseClient";
import { getCached } from "@/lib/queryCache";

const ECOM_TTL_MS = 20_000;

// Pedidos con alguno de estos estados, o marcados como cancelados, no
// cuentan para los cálculos de la sección Ecom (equivalente a OD_TERMINADO
// en el general): cancelados, ya despachados, ya cargados al camión o ya
// recibidos como devolución -- ninguno de estos tiene pendiente real.
export const ESTADOS_EXCLUIDOS_ECOM = ["OD_CANCELADA", "OD_DESPACHADO", "OD_CARGA_CAMION", "OD_RECIBIDO_DEV"];

export interface PedidoEcomRow {
  pedido: string;
  nombre_pedido: string | null;
  seller: string | null;
  estado_pedido: string | null;
  cancelado: string | null;
  ooll_asignado: string | null;
  sector: string | null;
  piso: string | null;
  uni: number | null;
  uni_plan: number | null;
  uni_pick: number | null;
  uni_sep: number | null;
  uni_pend: number | null;
  uni_nc: number | null;
  fecha_creacion: string | null;
  created_at: string | null;
}

export function esContableEcom(row: PedidoEcomRow): boolean {
  if ((row.cancelado || "").trim().toLowerCase() === "true") return false;
  const estado = (row.estado_pedido || "").trim().toUpperCase();
  return !ESTADOS_EXCLUIDOS_ECOM.includes(estado);
}

// Solo para la pestaña Resumen: a diferencia de Por Fecha/Por Pedidos,
// OD_CANCELADA y OD_RECIBIDO_DEV SÍ cuentan acá (hay una tarjeta dedicada a
// mostrarlos, "Unidades Canceladas"), y el flag "Cancelado" tampoco excluye
// -- solo quedan afuera los pedidos ya despachados o cargados al camión
// (que ya no tienen pendiente real), salvo que "Demanda Total" esté en Sí.
export const ESTADOS_EXCLUIDOS_ECOM_RESUMEN = ["OD_DESPACHADO", "OD_CARGA_CAMION"];

export function esContableEcomResumen(row: PedidoEcomRow, incluirTodos = false): boolean {
  if (incluirTodos) return true;
  const estado = (row.estado_pedido || "").trim().toUpperCase();
  return !ESTADOS_EXCLUIDOS_ECOM_RESUMEN.includes(estado);
}

/** Tarjeta "Unidades Canceladas por Clientes": solo estado OD_CANCELADA. Es
 * la única categoría de "cancelado" que se resta del total de unidades para
 * calcular Pendiente Picking/Separación -- OD_RECIBIDO_DEV y el flag
 * Cancelado="true" no afectan Pickeadas/Separadas/Pendiente. */
export function esCanceladaPorClienteEcom(row: PedidoEcomRow): boolean {
  return (row.estado_pedido || "").trim().toUpperCase() === "OD_CANCELADA";
}

/** Tarjeta "Unidades Canceladas sin stock": ya cargado al camión, pero
 * todavía con pendiente de separación (Uni - Uni.Sep > 0). */
export function esCanceladaSinStockEcom(row: PedidoEcomRow): boolean {
  const estado = (row.estado_pedido || "").trim().toUpperCase();
  if (estado !== "OD_CARGA_CAMION") return false;
  return num(row.uni) - num(row.uni_sep) > 0;
}

/** "OOLL asignado" hace de Canal para Ecom. Solo existen dos canales
 * posibles: MELI o INTRALOG -- cualquier otro valor (variantes de
 * mayúscula/minúscula, vacío, "ECOM", etc.) se considera INTRALOG. */
export function canalDeOoll(ooll: string | null): string {
  const v = (ooll || "").trim().toUpperCase();
  return v === "MELI" ? "MELI" : "INTRALOG";
}

export const num = (v: number | null): number => Number(v) || 0;

// Las unidades de un pedido OD_CANCELADA ya se cuentan por completo en
// "Unidades Canceladas por Clientes" -- si además sumaran su Uni.Pick/Uni.Sep
// a Pickeadas/Separadas, esas unidades quedarían contadas dos veces (rompe
// Total = Pickeadas + Pendiente Picking + Canceladas por Clientes).
export function pickEfectivoResumenEcom(row: PedidoEcomRow): number {
  return esCanceladaPorClienteEcom(row) ? 0 : num(row.uni_pick);
}
export function sepEfectivoResumenEcom(row: PedidoEcomRow): number {
  return esCanceladaPorClienteEcom(row) ? 0 : num(row.uni_sep);
}

/** Devuelve el created_at más reciente entre todas las filas (o null si no hay filas). */
export function ultimaActualizacionEcom(rows: PedidoEcomRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) {
    if (r.created_at && (!max || r.created_at > max)) {
      max = r.created_at;
    }
  }
  return max;
}

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas.
export async function fetchAllPedidosEcom(): Promise<PedidoEcomRow[]> {
  return getCached("pedidos_ecom:all", ECOM_TTL_MS, async () => {
    const PAGE_SIZE = 1000;
    let from = 0;
    const all: PedidoEcomRow[] = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("pedidos_ecom")
        .select(
          "pedido, nombre_pedido, seller, estado_pedido, cancelado, ooll_asignado, sector, piso, uni, uni_plan, uni_pick, uni_sep, uni_pend, uni_nc, fecha_creacion, created_at"
        )
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`Supabase (pedidos_ecom): ${error.message}`);
      }
      if (!data || data.length === 0) break;

      all.push(...(data as PedidoEcomRow[]));

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return all;
  });
}

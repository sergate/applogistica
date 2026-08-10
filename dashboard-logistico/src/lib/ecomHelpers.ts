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

/** "OOLL asignado" hace de Canal para Ecom -- se normaliza para que
 * variantes de mayúscula/minúscula (ej. "Intralog" / "INTRALOG") no cuenten
 * como canales distintos. */
export function canalDeOoll(ooll: string | null): string {
  const v = (ooll || "").trim().toUpperCase();
  return v || "SIN CANAL";
}

export const num = (v: number | null): number => Number(v) || 0;

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

import { supabaseAdmin } from "@/lib/supabaseClient";
import { getCached } from "@/lib/queryCache";

// Tablas grandes que se piden completas en cada visita a su pestaña de
// Resumen -- un TTL corto evita traer la tabla entera de vuelta si se
// cambia de filtro o se vuelve a la pestaña a los pocos segundos. Se
// invalida a mano en los endpoints de import/borrado correspondientes.
const PENDIENTE_DESPACHO_TTL_MS = 20_000;

export interface PendienteDespachoRow {
  numero: string;
  pedido_gaci: string | null;
  cant_cajas: number | null;
  unidades: number | null;
  nro_master: string | null;
  tipo: string | null;
  fecha: string | null;
  estado: string | null;
  cliente: string | null;
  curva: string | null;
  temporada: string | null;
  fecha_envio_gaci: string | null;
  f_remito: string | null;
  remito: string | null;
  ubicacion: string | null;
  ped_repo: string | null;
  est_repo: string | null;
  created_at: string | null;
}

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas.
export async function fetchAllPendienteDespacho(table: string): Promise<PendienteDespachoRow[]> {
  return getCached(`pendiente_despacho:${table}`, PENDIENTE_DESPACHO_TTL_MS, async () => {
    const PAGE_SIZE = 1000;
    let from = 0;
    const all: PendienteDespachoRow[] = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(
          "numero, pedido_gaci, cant_cajas, unidades, nro_master, tipo, fecha, estado, cliente, curva, temporada, fecha_envio_gaci, f_remito, remito, ubicacion, ped_repo, est_repo, created_at"
        )
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`Supabase (${table}): ${error.message}`);
      }
      if (!data || data.length === 0) break;

      all.push(...(data as PendienteDespachoRow[]));

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return all;
  });
}

/**
 * El campo "Cliente" trae el código y el nombre juntos, ej:
 * "250150 - MUNIZ HENRIQUEZ CINTYAN (CHK V. REGINA)" -> código = "250150", o
 * "1646 - TUCUMAN HIPER LIBERTAD-JAVO SRL" -> código = "1646" (en el archivo
 * de "Propios" los códigos no tienen largo fijo). El código es la corrida de
 * dígitos al principio, antes del " - ".
 */
export function parseCodigoCliente(clienteRaw: string | null): string | null {
  if (!clienteRaw) return null;
  const m = clienteRaw.trim().match(/^(\d+)\s*-\s*/);
  return m ? m[1] : null;
}

export interface PendienteDespachoPropiosRow {
  numero: string;
  curva: string | null;
  unidades: number | null;
  tipo: string | null;
  fecha: string | null;
  estado: string | null;
  cliente: string | null;
  ubicacion: string | null;
  remito: string | null;
  created_at: string | null;
}

export async function fetchAllPendienteDespachoPropios(): Promise<PendienteDespachoPropiosRow[]> {
  return getCached("pendiente_despacho:pendiente_despacho_propios", PENDIENTE_DESPACHO_TTL_MS, async () => {
    const PAGE_SIZE = 1000;
    let from = 0;
    const all: PendienteDespachoPropiosRow[] = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("pendiente_despacho_propios")
        .select("numero, curva, unidades, tipo, fecha, estado, cliente, ubicacion, remito, created_at")
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`Supabase (pendiente_despacho_propios): ${error.message}`);
      }
      if (!data || data.length === 0) break;

      all.push(...(data as PendienteDespachoPropiosRow[]));

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return all;
  });
}

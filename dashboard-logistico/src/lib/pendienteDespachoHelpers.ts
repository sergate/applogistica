import { getCached } from "@/lib/queryCache";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

// Tablas grandes que se piden completas en cada visita a su pestaña de
// Resumen. Se invalida a mano en los endpoints de import/borrado
// correspondientes, así que un TTL más largo no muestra datos más viejos
// que eso -- ver el mismo comentario en resumenHelpers.ts (MAESTROS_TTL_MS).
const PENDIENTE_DESPACHO_TTL_MS = 120_000;

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

export async function fetchAllPendienteDespacho(table: string): Promise<PendienteDespachoRow[]> {
  return getCached(`pendiente_despacho:${table}`, PENDIENTE_DESPACHO_TTL_MS, () =>
    fetchAllPaginated<PendienteDespachoRow>(
      table,
      "numero, pedido_gaci, cant_cajas, unidades, nro_master, tipo, fecha, estado, cliente, curva, temporada, fecha_envio_gaci, f_remito, remito, ubicacion, ped_repo, est_repo, created_at"
    )
  );
}

const SIN_MARCA = "SIN MARCA";

/** Número de contenedor limpio: sin tags HTML residuales, sin espacios y en mayúsculas. */
export function normalizarNumeroContenedor(v: string | null | undefined): string {
  return String(v ?? "").replace(/<[^>]*>/g, "").trim().toUpperCase();
}

/** Los contenedores de Carga Inicial se numeran "CI" + dígitos (ej. CI12683). */
export function esContenedorCI(numero: string): boolean {
  return /^CI\d+$/.test(numero);
}

/**
 * Marca de cada contenedor (tabla wms_contenedores, que carga el Agente Local
 * desde WMS -> Contenedores, Tipo = CI). Devuelve numero normalizado -> marca.
 */
export async function fetchMarcasContenedores(): Promise<Map<string, string>> {
  return getCached("pendiente_despacho:wms_contenedores", PENDIENTE_DESPACHO_TTL_MS, async () => {
    const filas = await fetchAllPaginated<{ contenedor: string; marca: string | null }>(
      "wms_contenedores",
      "contenedor, marca"
    );
    const mapa = new Map<string, string>();
    for (const f of filas) {
      const marca = (f.marca || "").trim();
      if (marca) mapa.set(normalizarNumeroContenedor(f.contenedor), marca);
    }
    return mapa;
  });
}

/** Marca de un contenedor para mostrar en pantalla ("SIN MARCA" si no está en el mapeo). */
export function marcaDeContenedor(marcas: Map<string, string>, numero: string | null | undefined): string {
  return marcas.get(normalizarNumeroContenedor(numero)) || SIN_MARCA;
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

/**
 * El campo "Cliente" que trae el WMS para Despacho usa otro formato, sin
 * guión, ej: "39960 DEPOSITO SHOWROOM CHK" -> código = "39960".
 */
export function parseCodigoClienteDespacho(clienteRaw: string | null): string | null {
  if (!clienteRaw) return null;
  const m = clienteRaw.trim().match(/^(\d+)\s+/);
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
  return getCached("pendiente_despacho:pendiente_despacho_propios", PENDIENTE_DESPACHO_TTL_MS, () =>
    fetchAllPaginated<PendienteDespachoPropiosRow>(
      "pendiente_despacho_propios",
      "numero, curva, unidades, tipo, fecha, estado, cliente, ubicacion, remito, created_at"
    )
  );
}

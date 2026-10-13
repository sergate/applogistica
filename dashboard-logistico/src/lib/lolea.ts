import { supabaseAdmin } from "@/lib/supabaseClient";

// Módulo Lolea: mini WMS para el stock del emprendimiento de Lolea. Lo que
// comparten las rutas y las pantallas.

/**
 * Ubicación virtual sin límite donde entra todo lo que se recibe (y el stock
 * inicial) hasta que el maquinista lo ubica, por partes, en una posición.
 */
export const UBICACION_STAGE = "STAGE";

/**
 * Zona de la tabla almacen_layout donde viven las posiciones de Lolea. Esa zona
 * queda fuera de Ocupación Almacén y de Pack and Hold, y la importación del
 * layout general no la toca.
 */
export const ZONA_LOLEA = "LOLEA";

/** Las posiciones se comparan sin espacios y en mayúsculas (el lector las tipea tal cual). */
export const normalizarPosicionLol = (v: string): string => v.replace(/\s+/g, "").toUpperCase();

interface EventoLolea {
  tipo: string;
  skuId?: number | null;
  ubicacion?: string | null;
  pedidoNumero?: string | null;
  cantidad?: number | null;
  resultado: "ok" | "error";
  mensaje?: string | null;
  usuarioId?: string | null;
}

/** Registro de auditoría. Nunca hace fallar la operación principal. */
export async function registrarEventoLol(e: EventoLolea): Promise<void> {
  try {
    await supabaseAdmin.from("lol_eventos").insert({
      tipo: e.tipo,
      sku_id: e.skuId ?? null,
      ubicacion: e.ubicacion ?? null,
      pedido_numero: e.pedidoNumero ?? null,
      cantidad: e.cantidad ?? null,
      resultado: e.resultado,
      mensaje: e.mensaje ?? null,
      usuario_id: e.usuarioId ?? null,
    });
  } catch {
    // el log es secundario
  }
}

export type EstadoStock = "sin_stock" | "bajo_minimo" | "en_el_minimo" | "ok";

/** Semáforo contra el stock de seguridad, sobre el stock DISPONIBLE (físico menos reservado). */
export function estadoDeStock(disponible: number, seguridad: number): EstadoStock {
  if (disponible === 0) return "sin_stock";
  if (disponible < seguridad) return "bajo_minimo";
  if (disponible === seguridad) return "en_el_minimo";
  return "ok";
}

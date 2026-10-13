// Módulo Lolea: mini WMS para el stock del emprendimiento de Lolea. Lo que
// comparten las rutas y las pantallas.

/**
 * Ubicación virtual sin límite donde entra todo lo que se recibe (y el stock
 * inicial) hasta que el maquinista lo ubica, por partes, en una posición.
 */
export const UBICACION_STAGE = "STAGE";

export type EstadoStock = "sin_stock" | "bajo_minimo" | "en_el_minimo" | "ok";

/** Semáforo contra el stock de seguridad, sobre el stock DISPONIBLE (físico menos reservado). */
export function estadoDeStock(disponible: number, seguridad: number): EstadoStock {
  if (disponible === 0) return "sin_stock";
  if (disponible < seguridad) return "bajo_minimo";
  if (disponible === seguridad) return "en_el_minimo";
  return "ok";
}

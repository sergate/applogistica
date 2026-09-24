import { supabaseAdmin } from "@/lib/supabaseClient";

// Avisos por Supabase Realtime (canal "broadcast", sin tocar ninguna tabla)
// para que el Agente Local y el navegador dejen de tener que preguntar por
// polling si hay algo nuevo -- ver actualizaciones_wms y las rutas
// /api/actualizaciones/*. Un broadcast fallido nunca debe romper la
// operación principal (el pedido ya quedó guardado en la tabla de todas
// formas): quien escucha también tiene un poll de seguridad de baja
// frecuencia como red por si se pierde algún aviso.

async function emitir(canal: string, evento: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const resultado = await supabaseAdmin.channel(canal).send({ type: "broadcast", event: evento, payload });
    if (resultado !== "ok") throw new Error(`Realtime respondió "${resultado}"`);
  } catch (err) {
    console.error(`[realtimeBroadcast] Error emitiendo ${canal}/${evento}:`, err instanceof Error ? err.message : err);
  }
}

// Avisa al Agente Local de ese usuario que hay un pedido nuevo/reabierto
// esperando -- el Agente reacciona llamando a /api/actualizaciones/agente/proximo
// (que ya valida todo por su cuenta), este aviso no manda datos del pedido.
export function emitirNuevoPedido(usuarioId: string): Promise<void> {
  return emitir(`actualizaciones:agente:${usuarioId}`, "nuevo_pedido", {});
}

// Avisa a quien esté mirando el botón "Actualizar esta sección" (el
// navegador que lo disparó) que cambió el estado/progreso de un pedido
// puntual.
export function emitirCambioEstado(
  trabajoId: number,
  cambios: { estado?: string; progreso?: number | null; paso?: string | null; mensaje?: string | null }
): Promise<void> {
  return emitir(`actualizaciones:trabajo:${trabajoId}`, "cambio_estado", cambios);
}

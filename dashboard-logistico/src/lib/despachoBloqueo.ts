import { parseCodigoClienteDespacho } from "@/lib/pendienteDespachoHelpers";

// Código de cliente del local "Outlet Fábrica" en despacho_guias.cliente
// (viene como "1254 OUTLET FABRICA...", parseCodigoClienteDespacho saca el
// número inicial).
const CODIGO_OUTLET_FABRICA = "1254";

// Próximo día hábil (lun-vie) estrictamente posterior a la fecha dada, a
// medianoche.
function siguienteDiaHabil(desde: Date): Date {
  const d = new Date(desde);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d;
}

// "Hoy es <= 1 día hábil" de la fecha de la hoja: la fecha de la hoja cae
// hoy, en el pasado (ya debería haber salido), o en el próximo día hábil.
function fechaDentroDeVentana(fechaISO: string): boolean {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = siguienteDiaHabil(hoy);
  const fecha = new Date(`${fechaISO}T00:00:00`);
  return fecha.getTime() <= limite.getTime();
}

// Una guía de despacho de Outlet Fábrica se trata como si ya estuviera en
// DP_COT_OK (bloquea modificar/anular su Hoja de Ruta) cuando la fecha de
// esa hoja está a 1 día hábil o menos -- sin pisar el estado_wms real, que
// viene del WMS y se sobreescribe en cada import.
export function esGuiaOutletFabricaBloqueante(cliente: string | null, fechaHojaISO: string): boolean {
  return parseCodigoClienteDespacho(cliente) === CODIGO_OUTLET_FABRICA && fechaDentroDeVentana(fechaHojaISO);
}

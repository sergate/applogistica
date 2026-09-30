// Cálculo de vacaciones y ventana de trimestres del módulo Personal CD.
// Sin dependencias de Supabase -- se usa tanto desde las API routes como
// desde el componente de Vacaciones en el browser.

/** Inicio del ciclo de vacaciones vigente: octubre de este año. */
export const CICLO_INICIO = new Date(2026, 9, 1);
/** Fin del ciclo: noviembre del año siguiente. */
export const CICLO_FIN = new Date(2027, 10, 30);

export interface Trimestre {
  label: string;
  inicio: Date;
  fin: Date;
}

/** Los 5 trimestres del ciclo (Oct-Dic, Ene-Mar, Abr-Jun, Jul-Sep, Oct-Nov). */
export const TRIMESTRES: Trimestre[] = [
  { label: "Oct - Dic 2026", inicio: new Date(2026, 9, 1), fin: new Date(2026, 11, 31) },
  { label: "Ene - Mar 2027", inicio: new Date(2027, 0, 1), fin: new Date(2027, 2, 31) },
  { label: "Abr - Jun 2027", inicio: new Date(2027, 3, 1), fin: new Date(2027, 5, 30) },
  { label: "Jul - Sep 2027", inicio: new Date(2027, 6, 1), fin: new Date(2027, 8, 30) },
  { label: "Oct - Nov 2027", inicio: new Date(2027, 9, 1), fin: new Date(2027, 10, 30) },
];

/** Tramos de antigüedad -> días de vacaciones (Ley de Contrato de Trabajo). */
export function calcularVacacionesPorAntiguedad(anios: number): number {
  if (anios < 5) return 14;
  if (anios < 10) return 21;
  if (anios < 20) return 28;
  return 35;
}

/** Antigüedad en años (con decimales) al inicio del ciclo vigente. */
export function calcularAntiguedadAnios(fechaIngresoISO: string, fechaReferencia: Date = CICLO_INICIO): number {
  const ingreso = new Date(fechaIngresoISO);
  const ms = fechaReferencia.getTime() - ingreso.getTime();
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

/** Lunes de cada semana que toca el rango [inicio, fin] (ambos inclusive). */
export function getSemanas(inicio: Date, fin: Date): Date[] {
  const d = new Date(inicio);
  const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diff);

  const semanas: Date[] = [];
  while (d <= fin) {
    semanas.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return semanas;
}

/** "YYYY-MM-DD" para persistir/buscar en la base. */
export function semanaISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** "dd/mm" para mostrar en el encabezado de columna. */
export function semanaLabel(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

// Cálculo de días hábiles (lunes a viernes, excluyendo feriados cargados).
// Las fechas se manejan siempre como string "YYYY-MM-DD" para evitar
// problemas de huso horario al parsear con `new Date(...)`.

function parseFechaUTC(fechaISO: string): Date {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function esDiaHabil(fechaISO: string, feriados: Set<string>): boolean {
  if (feriados.has(fechaISO)) return false;
  const diaSemana = parseFechaUTC(fechaISO).getUTCDay(); // 0 = domingo, 6 = sábado
  return diaSemana !== 0 && diaSemana !== 6;
}

/** Cuenta los días hábiles en el rango [desdeISO, hastaISO] (inclusive). */
export function diasHabilesEntre(desdeISO: string, hastaISO: string, feriados: Set<string>): number {
  if (hastaISO < desdeISO) return 0;

  let cursor = parseFechaUTC(desdeISO);
  const fin = parseFechaUTC(hastaISO);
  let count = 0;

  while (cursor.getTime() <= fin.getTime()) {
    const fechaISO = cursor.toISOString().slice(0, 10);
    if (esDiaHabil(fechaISO, feriados)) count++;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return count;
}

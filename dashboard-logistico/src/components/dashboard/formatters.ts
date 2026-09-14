// Paleta de colores para el "dot" de cada marca (seller), asignados por orden de aparición
export const DOT_PALETTE = [
  "bg-purple-400", "bg-emerald-500", "bg-blue-400", "bg-red-400",
  "bg-orange-400", "bg-pink-400", "bg-teal-400", "bg-amber-400",
];
export const dotForMarca = (index: number) => DOT_PALETTE[index % DOT_PALETTE.length];
export const dotForMarcaName = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return DOT_PALETTE[hash % DOT_PALETTE.length];
};

// Formato numérico es-AR ("85.781") y de porcentaje ("3.3%")
export const fmtNum = (n: number) => Math.round(n).toLocaleString("es-AR");
export const fmtPct = (n: number) => `${n.toFixed(1)}%`;
export const fmtFecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
// Para fechas "solas" (YYYY-MM-DD, sin hora) -- evita el corrimiento de
// huso horario que da `new Date("YYYY-MM-DD")` al pasar por toLocaleString.
export const fmtSoloFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Semanas del mes (domingo a sábado). La semana 1 es la que contiene el
// día 1 del mes, aunque empiece en el mes anterior; la última es la que
// contiene el último día, aunque termine en el mes siguiente.
export interface SemanaDelMes {
  numero: number;
  desde: string; // ISO YYYY-MM-DD
  hasta: string; // ISO YYYY-MM-DD
  label: string;
}
export const fmtFechaCorta = (d: Date) =>
  d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
// Semanas del CALENDARIO ANUAL LABORAL: numeradas de forma continua a lo
// largo de todo el año (no se reinician cada mes). La Semana 1 es la que
// contiene el 1° de enero (domingo a sábado).
export function semanasDelAnio(year: number): SemanaDelMes[] {
  const primerDia = new Date(year, 0, 1);
  const ultimoDia = new Date(year, 11, 31);
  const semanas: SemanaDelMes[] = [];
  const cursor = new Date(primerDia);
  cursor.setDate(cursor.getDate() - cursor.getDay()); // retrocede al domingo
  let n = 1;
  while (cursor <= ultimoDia) {
    const desde = new Date(cursor);
    const hasta = new Date(cursor);
    hasta.setDate(hasta.getDate() + 6);
    semanas.push({
      numero: n,
      desde: toISODate(desde),
      hasta: toISODate(hasta),
      label: `Semana ${n} • ${year} (${fmtFechaCorta(desde)} - ${fmtFechaCorta(hasta)})`,
    });
    cursor.setDate(cursor.getDate() + 7);
    n++;
  }
  return semanas;
}

// Dado un listado de fechas "YYYY-MM-DD", arma las semanas del año que
// efectivamente tienen algún dato dentro de su rango (evita generar las
// ~52 semanas de todo el año si no hace falta, y evita huecos en el medio).
// Clases Tailwind por "theme" de una tarjeta KPI (usado en todas las
// secciones de Resumen/KPI de la app).
export const getThemeClasses = (theme: string) => {
  switch (theme) {
    case "blue": return { text: "text-sky-500", bgIcon: "bg-sky-100", textIcon: "text-sky-500", blob: "bg-sky-50" };
    case "green": return { text: "text-emerald-500", bgIcon: "bg-emerald-100", textIcon: "text-emerald-500", blob: "bg-emerald-50" };
    case "purple": return { text: "text-indigo-400", bgIcon: "bg-indigo-100", textIcon: "text-indigo-400", blob: "bg-indigo-50" };
    case "orange": return { text: "text-orange-400", bgIcon: "bg-orange-100", textIcon: "text-orange-400", blob: "bg-orange-50" };
    case "red": return { text: "text-red-400", bgIcon: "bg-red-100", textIcon: "text-red-400", blob: "bg-red-50" };
    default: return { text: "text-slate-500", bgIcon: "bg-slate-100", textIcon: "text-slate-500", blob: "bg-slate-50" };
  }
};

export function semanasConDatosDe(fechas: string[]): SemanaDelMes[] {
  const fechasValidas = fechas.filter((f) => f !== "SIN FECHA");
  if (fechasValidas.length === 0) return [];

  const minFecha = fechasValidas.reduce((a, b) => (a < b ? a : b));
  const maxFecha = fechasValidas.reduce((a, b) => (a > b ? a : b));
  const anioMin = Number(minFecha.slice(0, 4));
  const anioMax = Number(maxFecha.slice(0, 4));

  let todas: SemanaDelMes[] = [];
  for (let y = anioMin; y <= anioMax; y++) {
    todas = todas.concat(semanasDelAnio(y));
  }
  return todas.filter((s) => fechasValidas.some((f) => f >= s.desde && f <= s.hasta));
}

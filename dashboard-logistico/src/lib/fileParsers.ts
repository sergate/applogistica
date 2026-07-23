import * as XLSX from "xlsx";
import Papa from "papaparse";

// Normaliza los nombres de columna: minúsculas, sin espacios/acentos, guion bajo.
// Así "Nombre Cliente" o "Código Grupo" quedan como "nombre_cliente" / "codigo_grupo"
// y matchean más fácil con los nombres de columna típicos de Postgres/Supabase.
function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // cualquier corrida de espacios/puntos/símbolos -> un solo "_"
    .replace(/^_+|_+$/g, ""); // saca "_" sobrantes al principio/final
}

// Únicos campos que realmente necesitamos como NÚMERO en Supabase (columnas INT).
// Todo lo demás (pedido, codigo, tiendas_destino, tracking_pedido, etc.) se deja
// como texto tal cual viene del archivo, para no perder ceros a la izquierda
// y que los códigos matcheen exacto entre tablas al cruzarlos.
const CAMPOS_NUMERICOS = new Set([
  "uni",
  "uni_pick",
  "uni_sep",
  "uni_plan",
  "uni_pend",
  "pedidas",
  "distribuidas",
  "pendientes",
  "stock_sp",
  "stock",
  "reservado",
  "stock_total",
  "cantidad",
  "legajo",
  "unidades",
  "fob_total_usd",
]);

function normalizeRecordKeys(
  records: Record<string, unknown>[]
): Record<string, unknown>[] {
  return records.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      const headerNormalizado = normalizeHeader(key);
      let value = row[key];

      if (value === "") value = null;

      // Solo forzamos a número los campos de cantidades (uni, uni_pick, etc).
      // El resto queda como string, para no romper códigos con ceros a la izquierda.
      if (CAMPOS_NUMERICOS.has(headerNormalizado) && value !== null && value !== undefined) {
        const n = Number(String(value).trim().replace(",", "."));
        value = Number.isFinite(n) ? n : null;
      } else if (value !== null && value !== undefined) {
        // Todo lo demás: texto, sin importar si "parece" un número.
        value = String(value).trim();
      }

      normalized[headerNormalizado] = value;
    }
    return normalized;
  });
}

/**
 * Parsea un archivo Excel (.xlsx/.xls) a un array de objetos, usando la
 * primera fila como encabezados de columna.
 *
 * raw:false hace que las celdas se lean como el texto formateado que se ve
 * en Excel (no como el número/fecha crudo), así un código como "0123" no
 * se convierte en el número 123 y pierde el cero a la izquierda.
 */
export async function parseExcelFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("El archivo Excel no contiene ninguna hoja.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  return normalizeRecordKeys(rows);
}

/**
 * Parsea un archivo CSV a un array de objetos, usando la primera fila
 * como encabezados de columna. Detecta automáticamente el separador
 * (coma o punto y coma), muy común en exports de sistemas locales.
 *
 * dynamicTyping queda en false a propósito: NO queremos que Papa Parse
 * adivine tipos, porque convierte códigos como "007123" al número 7123
 * y pierde los ceros a la izquierda. La conversión a número se hace
 * explícita en normalizeRecordKeys, solo para los campos de cantidades.
 */
// Convierte el valor crudo de una celda de fecha a ISO "yyyy-mm-dd". El
// archivo puede traer, para la misma columna, celdas de fecha reales de
// Excel (llegan como Date por `cellDates:true`) y celdas cargadas a mano
// como texto "dd/mm/yyyy" -- hay que soportar ambos casos.
function excelValueToISODate(value: unknown): string | null {
  if (value instanceof Date) {
    // Excel guarda la fecha "pura" como medianoche UTC -> usamos los
    // getters UTC para no correrse un día según el huso horario del navegador.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const [, d, mo, y] = dmy;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Serial de fecha de Excel (días desde 1899-12-30), por si cellDates
    // no lo convirtió a Date (celdas sin formato de fecha explícito).
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Igual que `parseExcelFile`, pero pensado para archivos donde una misma
 * columna de fecha puede traer, fila por fila, celdas de fecha reales de
 * Excel o texto "dd/mm/yyyy" cargado a mano (ej: reporte de Inbound). Lee
 * con `cellDates:true` + `raw:true` para no depender del texto formateado
 * de la celda (`cell.w`), que no siempre es parseable de forma confiable
 * cuando los formatos de fecha vienen mezclados. `camposFecha` son los
 * headers ya normalizados (ej: "etd", "eta", "arribo_al_cd") que hay que
 * tratar como fecha en vez de como texto/número.
 */
export async function parseExcelFileConFechas(
  file: File,
  camposFecha: string[]
): Promise<Record<string, unknown>[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("El archivo Excel no contiene ninguna hoja.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  const camposFechaSet = new Set(camposFecha);

  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      const headerNormalizado = normalizeHeader(key);
      let value = row[key];

      if (value === "") value = null;

      if (camposFechaSet.has(headerNormalizado)) {
        normalized[headerNormalizado] = excelValueToISODate(value);
        continue;
      }

      if (CAMPOS_NUMERICOS.has(headerNormalizado) && value !== null && value !== undefined) {
        const n = Number(String(value).trim().replace(",", "."));
        value = Number.isFinite(n) ? n : null;
      } else if (value !== null && value !== undefined) {
        value = String(value).trim();
      }

      normalized[headerNormalizado] = value;
    }
    return normalized;
  });
}

export async function parseCsvFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const text = await file.text();

  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new Error(
      `Error parseando CSV (fila ${firstError.row ?? "?"}): ${firstError.message}`
    );
  }

  return normalizeRecordKeys(result.data);
}

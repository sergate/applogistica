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
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeRecordKeys(
  records: Record<string, unknown>[]
): Record<string, unknown>[] {
  return records.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      const value = row[key];
      normalized[normalizeHeader(key)] = value === "" ? null : value;
    }
    return normalized;
  });
}

/**
 * Parsea un archivo Excel (.xlsx/.xls) a un array de objetos, usando la
 * primera fila como encabezados de columna.
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
    raw: true,
  });

  return normalizeRecordKeys(rows);
}

/**
 * Parsea un archivo CSV a un array de objetos, usando la primera fila
 * como encabezados de columna. Detecta automáticamente el separador
 * (coma o punto y coma), muy común en exports de sistemas locales.
 */
export async function parseCsvFile(
  file: File
): Promise<Record<string, unknown>[]> {
  const text = await file.text();

  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new Error(
      `Error parseando CSV (fila ${firstError.row ?? "?"}): ${firstError.message}`
    );
  }

  return normalizeRecordKeys(result.data);
}

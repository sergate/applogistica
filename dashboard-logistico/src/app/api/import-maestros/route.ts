import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { parseCsvFile, parseExcelFile } from "@/lib/fileParsers";

export const runtime = "nodejs"; // necesitamos Node (no Edge) por el parseo de Excel/CSV

// -----------------------------------------------------------------------
// Configuración de cada archivo esperado:
//
// - clientes  -> tabla "clientes"        (PK: codigo, sí es único) -> UPSERT
// - grupos    -> tabla "grupo_pedidos"    (PK: id autogenerado;
//                 "pedido" puede repetirse, una fila por cada "grupo")
//                 -> REEMPLAZO TOTAL (se borra toda la tabla y se inserta de nuevo)
// - tiendas   -> tabla "tiendas_destino"  (PK: id autogenerado;
//                 "pedido" puede repetirse, una fila por tienda destino)
//                 -> REEMPLAZO TOTAL
//
// grupos y tiendas usan reemplazo total porque cada archivo es la foto
// completa y vigente de los pedidos activos (no algo incremental) — así
// evitamos que queden filas viejas/de prueba mezcladas con las nuevas.
// -----------------------------------------------------------------------
const IMPORT_CONFIG = {
  clientes: {
    table: "clientes",
    parser: "excel",
    mode: "upsert",
    conflictColumn: "codigo",
  },
  grupos: {
    table: "grupo_pedidos",
    parser: "csv",
    mode: "full_replace",
  },
  tiendas: {
    table: "tiendas_destino",
    parser: "csv",
    mode: "full_replace",
  },
} as const;

type ImportKey = keyof typeof IMPORT_CONFIG;

const BATCH_SIZE = 500;

interface FileResult {
  archivo: ImportKey;
  filasLeidas: number;
  filasInsertadas: number;
  error: string | null;
}

async function insertInBatches(
  table: string,
  records: Record<string, unknown>[]
): Promise<number> {
  let totalInsertadas = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabaseAdmin
      .from(table)
      .insert(batch, { count: "exact" });

    if (error) {
      throw new Error(`Supabase (${table} - insert): ${error.message}`);
    }
    totalInsertadas += count ?? batch.length;
  }

  return totalInsertadas;
}

/**
 * Upsert por columna única (para tablas donde sí existe una clave real,
 * como clientes.codigo). Deduplica dentro del archivo por si la misma
 * clave aparece 2 veces (Postgres no permite tocar la misma fila 2 veces
 * en un solo UPSERT).
 */
async function upsertInBatches(
  table: string,
  conflictColumn: string,
  records: Record<string, unknown>[]
): Promise<number> {
  const deduped = new Map<unknown, Record<string, unknown>>();
  for (const record of records) {
    const key = record[conflictColumn];
    if (key === null || key === undefined || key === "") continue;
    deduped.set(key, record);
  }
  const uniqueRecords = Array.from(deduped.values());

  let totalInsertadas = 0;
  for (let i = 0; i < uniqueRecords.length; i += BATCH_SIZE) {
    const batch = uniqueRecords.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabaseAdmin
      .from(table)
      .upsert(batch, { onConflict: conflictColumn, count: "exact" });

    if (error) {
      throw new Error(`Supabase (${table}): ${error.message}`);
    }
    totalInsertadas += count ?? batch.length;
  }

  return totalInsertadas;
}

/**
 * Reemplazo total: borra TODAS las filas de la tabla y después inserta
 * el contenido completo del archivo. Usado para tablas donde no existe
 * una columna única por fila (grupo_pedidos, tiendas_destino), y donde
 * cada archivo representa la foto completa y vigente de los datos.
 */
async function fullReplaceInBatches(
  table: string,
  records: Record<string, unknown>[]
): Promise<number> {
  // Truco para borrar TODAS las filas con el cliente de Supabase (que exige
  // algún filtro): "id no es null" matchea siempre, ya que id es NOT NULL.
  const { error: delError } = await supabaseAdmin.from(table).delete().not("id", "is", null);
  if (delError) {
    throw new Error(`Supabase (${table} - borrado total): ${delError.message}`);
  }

  return insertInBatches(table, records);
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.",
      },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();

    const entries = Object.entries(IMPORT_CONFIG) as [
      ImportKey,
      (typeof IMPORT_CONFIG)[ImportKey]
    ][];

    // Validamos que los 3 archivos estén presentes antes de procesar nada.
    const files: Partial<Record<ImportKey, File>> = {};
    for (const [key] of entries) {
      const file = formData.get(key);
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json(
          { success: false, error: `Falta el archivo "${key}".` },
          { status: 400 }
        );
      }
      files[key] = file;
    }

    const resultados: FileResult[] = [];
    let huboError = false;

    // Secuencial (no Promise.all): procesamos clientes, grupos y tiendas en orden.
    for (const [key, config] of entries) {
      const file = files[key]!;
      try {
        const records =
          config.parser === "excel"
            ? await parseExcelFile(file)
            : await parseCsvFile(file);

        if (records.length === 0) {
          resultados.push({
            archivo: key,
            filasLeidas: 0,
            filasInsertadas: 0,
            error: "El archivo no tiene filas de datos.",
          });
          huboError = true;
          continue;
        }

        const filasInsertadas =
          config.mode === "upsert"
            ? await upsertInBatches(config.table, config.conflictColumn, records)
            : await fullReplaceInBatches(config.table, records);

        resultados.push({
          archivo: key,
          filasLeidas: records.length,
          filasInsertadas,
          error: null,
        });
      } catch (err) {
        huboError = true;
        resultados.push({
          archivo: key,
          filasLeidas: 0,
          filasInsertadas: 0,
          error: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }

    return NextResponse.json(
      { success: !huboError, resultados },
      { status: huboError ? 207 : 200 } // 207 = éxito parcial
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Error inesperado en el servidor",
      },
      { status: 500 }
    );
  }
}
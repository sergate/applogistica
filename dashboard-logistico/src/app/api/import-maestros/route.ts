import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { parseCsvFile, parseExcelFile } from "@/lib/fileParsers";

export const runtime = "nodejs"; // necesitamos Node (no Edge) por el parseo de Excel/CSV

// -----------------------------------------------------------------------
// Configuración de cada archivo esperado, calcada de tu script SQL:
//
// - clientes        -> tabla "clientes"        (PK: codigo)          -> UPSERT
// - grupos          -> tabla "grupo_pedidos"    (PK: pedido)         -> UPSERT
// - tiendas         -> tabla "tiendas_destino"  (PK: id autogenerado,
//                       "pedido" es FK a grupo_pedidos y NO es único) -> REPLACE
//                       (se borran las filas de esos "pedido" y se insertan de nuevo)
//
// Por la FK de tiendas_destino -> grupo_pedidos, el archivo de "grupos" se
// procesa antes que el de "tiendas" (el for de abajo es secuencial, no paralelo).
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
    mode: "upsert",
    conflictColumn: "pedido",
  },
  tiendas: {
    table: "tiendas_destino",
    parser: "csv",
    mode: "replace",
    keyColumn: "pedido",
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

async function upsertInBatches(
  table: string,
  conflictColumn: string,
  records: Record<string, unknown>[]
): Promise<number> {
  let totalInsertadas = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
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
 * Para tablas sin columna única disponible (como tiendas_destino, donde el
 * PK es un id autogenerado): borra las filas existentes que coincidan con
 * los valores de "keyColumn" presentes en el archivo, y después inserta
 * todo de nuevo. Evita duplicar filas si el mismo archivo se reimporta.
 */
async function replaceInBatches(
  table: string,
  keyColumn: string,
  records: Record<string, unknown>[]
): Promise<number> {
  const uniqueKeys = Array.from(
    new Set(
      records
        .map((r) => r[keyColumn])
        .filter((v) => v !== null && v !== undefined && v !== "")
    )
  );

  for (let i = 0; i < uniqueKeys.length; i += BATCH_SIZE) {
    const chunk = uniqueKeys.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin.from(table).delete().in(keyColumn, chunk);
    if (error) {
      throw new Error(`Supabase (${table} - borrado previo): ${error.message}`);
    }
  }

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

    // Secuencial (no Promise.all): grupos debe insertarse antes que tiendas
    // por la FK tiendas_destino.pedido -> grupo_pedidos.pedido
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
            : await replaceInBatches(config.table, config.keyColumn, records);

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

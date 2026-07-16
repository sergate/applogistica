import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";

// -----------------------------------------------------------------------
// Este endpoint recibe LOTES de registros ya parseados (JSON), no el
// archivo entero. El parseo del Excel/CSV se hace en el navegador
// (src/lib/fileParsers.ts) y el frontend manda los datos en tandas chicas,
// para no chocar con el límite de 4.5MB por request de las funciones
// serverless de Vercel (ese límite es fijo, no se puede subir desde acá).
//
// - clientes -> tabla "clientes"        (PK: codigo)       -> UPSERT por lote
// - grupos   -> tabla "grupo_pedidos"   (sin clave única)   -> el primer lote
// - tiendas  -> tabla "tiendas_destino" (sin clave única)      borra TODA la
//                                                               tabla, después
//                                                               todos los lotes
//                                                               solo insertan
// -----------------------------------------------------------------------
const IMPORT_CONFIG = {
  clientes: { table: "clientes", mode: "upsert", conflictColumn: "codigo" },
  grupos: { table: "grupo_pedidos", mode: "full_replace" },
  tiendas: { table: "tiendas_destino", mode: "full_replace" },
} as const;

type ImportKey = keyof typeof IMPORT_CONFIG;

function esImportKey(v: unknown): v is ImportKey {
  return v === "clientes" || v === "grupos" || v === "tiendas";
}

async function insertarLote(table: string, batch: Record<string, unknown>[]): Promise<number> {
  const { error, count } = await supabaseAdmin.from(table).insert(batch, { count: "exact" });
  if (error) {
    throw new Error(`Supabase (${table} - insert): ${error.message}`);
  }
  return count ?? batch.length;
}

/** Upsert deduplicando dentro del lote (Postgres no permite tocar la misma fila 2 veces en un UPSERT). */
async function upsertLote(
  table: string,
  conflictColumn: string,
  batch: Record<string, unknown>[]
): Promise<number> {
  const deduped = new Map<unknown, Record<string, unknown>>();
  for (const record of batch) {
    const key = record[conflictColumn];
    if (key === null || key === undefined || key === "") continue;
    deduped.set(key, record);
  }
  const uniqueRecords = Array.from(deduped.values());
  if (uniqueRecords.length === 0) return 0;

  const { error, count } = await supabaseAdmin
    .from(table)
    .upsert(uniqueRecords, { onConflict: conflictColumn, count: "exact" });

  if (error) {
    throw new Error(`Supabase (${table}): ${error.message}`);
  }
  return count ?? uniqueRecords.length;
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      {
        success: false,
        error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { archivo, batch, esPrimerLote } = body as {
      archivo: unknown;
      batch: unknown;
      esPrimerLote: unknown;
    };

    if (!esImportKey(archivo)) {
      return NextResponse.json(
        { success: false, error: `"archivo" inválido: ${String(archivo)}` },
        { status: 400 }
      );
    }
    if (!Array.isArray(batch)) {
      return NextResponse.json({ success: false, error: '"batch" debe ser un array.' }, { status: 400 });
    }

    const config = IMPORT_CONFIG[archivo];

    // Antes del primer lote de una tabla "full_replace", borramos todo lo
    // que había (el archivo es la foto completa y vigente de los datos).
    if (config.mode === "full_replace" && esPrimerLote) {
      const { error: delError } = await supabaseAdmin.from(config.table).delete().not("id", "is", null);
      if (delError) {
        throw new Error(`Supabase (${config.table} - borrado total): ${delError.message}`);
      }
    }

    if (batch.length === 0) {
      return NextResponse.json({ success: true, filasInsertadas: 0 });
    }

    const filasInsertadas =
      config.mode === "upsert"
        ? await upsertLote(config.table, config.conflictColumn, batch as Record<string, unknown>[])
        : await insertarLote(config.table, batch as Record<string, unknown>[]);

    return NextResponse.json({ success: true, filasInsertadas });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

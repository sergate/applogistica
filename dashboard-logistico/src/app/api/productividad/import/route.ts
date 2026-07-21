import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";

// -----------------------------------------------------------------------
// Recibe lotes de registros ya parseados en el navegador. Antes de insertar
// el primer lote, se borran de la tabla todas las filas cuya "fecha" esté
// presente en los archivos que se están importando (no se toca el resto
// de la tabla). Las fechas llegan ya normalizadas a formato ISO
// (YYYY-MM-DD) desde el frontend.
// -----------------------------------------------------------------------
const DELETE_CHUNK = 500;

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { batch, fechasAEliminar, esPrimerLote } = body as {
      batch: unknown;
      fechasAEliminar: unknown;
      esPrimerLote: unknown;
    };

    if (!Array.isArray(batch)) {
      return NextResponse.json({ success: false, error: '"batch" debe ser un array.' }, { status: 400 });
    }

    if (esPrimerLote && Array.isArray(fechasAEliminar) && fechasAEliminar.length > 0) {
      for (let i = 0; i < fechasAEliminar.length; i += DELETE_CHUNK) {
        const chunk = fechasAEliminar.slice(i, i + DELETE_CHUNK);
        const { error } = await supabaseAdmin.from("productividad").delete().in("fecha", chunk);
        if (error) {
          throw new Error(`Supabase (productividad - borrado por fecha): ${error.message}`);
        }
      }
    }

    if (batch.length === 0) {
      return NextResponse.json({ success: true, filasInsertadas: 0 });
    }

    const { error, count } = await supabaseAdmin
      .from("productividad")
      .insert(batch as Record<string, unknown>[], { count: "exact" });

    if (error) {
      throw new Error(`Supabase (productividad - insert): ${error.message}`);
    }

    return NextResponse.json({ success: true, filasInsertadas: count ?? batch.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

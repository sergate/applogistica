import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";

// -----------------------------------------------------------------------
// Recibe lotes de registros ya parseados en el navegador. Antes de insertar
// el primer lote, se borran de la tabla solo las filas cuya combinación
// EXACTA de (fecha, tipo_proceso) esté presente en el archivo que se está
// importando -- si la fecha coincide pero el tipo de proceso no está en el
// archivo nuevo, esas filas NO se tocan. Las fechas llegan ya normalizadas
// a formato ISO (YYYY-MM-DD) desde el frontend.
// -----------------------------------------------------------------------

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { batch, combinacionesAEliminar, esPrimerLote } = body as {
      batch: unknown;
      combinacionesAEliminar: unknown;
      esPrimerLote: unknown;
    };

    if (!Array.isArray(batch)) {
      return NextResponse.json({ success: false, error: '"batch" debe ser un array.' }, { status: 400 });
    }

    if (esPrimerLote && Array.isArray(combinacionesAEliminar)) {
      for (const combo of combinacionesAEliminar as { fecha: string; tipos: string[] }[]) {
        if (!combo?.fecha || !Array.isArray(combo.tipos) || combo.tipos.length === 0) continue;
        const { error } = await supabaseAdmin
          .from("productividad")
          .delete()
          .eq("fecha", combo.fecha)
          .in("tipo_proceso", combo.tipos);
        if (error) {
          throw new Error(`Supabase (productividad - borrado por fecha+tipo_proceso): ${error.message}`);
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

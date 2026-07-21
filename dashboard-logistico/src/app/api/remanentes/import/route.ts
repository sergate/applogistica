import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";

// -----------------------------------------------------------------------
// Mismo patrón que /api/carga-inicial/import: recibe lotes de registros ya
// parseados en el navegador, y antes de insertar el primer lote borra de
// la tabla todas las filas cuyo "numero" esté presente en el archivo que
// se está importando (no se toca el resto de la tabla).
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
    const { batch, numerosAEliminar, esPrimerLote } = body as {
      batch: unknown;
      numerosAEliminar: unknown;
      esPrimerLote: unknown;
    };

    if (!Array.isArray(batch)) {
      return NextResponse.json({ success: false, error: '"batch" debe ser un array.' }, { status: 400 });
    }

    if (esPrimerLote && Array.isArray(numerosAEliminar) && numerosAEliminar.length > 0) {
      for (let i = 0; i < numerosAEliminar.length; i += DELETE_CHUNK) {
        const chunk = numerosAEliminar.slice(i, i + DELETE_CHUNK);
        const { error } = await supabaseAdmin.from("remanentes").delete().in("numero", chunk);
        if (error) {
          throw new Error(`Supabase (remanentes - borrado por numero): ${error.message}`);
        }
      }
    }

    if (batch.length === 0) {
      return NextResponse.json({ success: true, filasInsertadas: 0 });
    }

    const { error, count } = await supabaseAdmin
      .from("remanentes")
      .insert(batch as Record<string, unknown>[], { count: "exact" });

    if (error) {
      throw new Error(`Supabase (remanentes - insert): ${error.message}`);
    }

    return NextResponse.json({ success: true, filasInsertadas: count ?? batch.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";

// -----------------------------------------------------------------------
// Mismo patrón que /api/carga-inicial/import y /api/remanentes/import:
// recibe lotes ya parseados en el navegador. Reemplazo por "legajo": antes
// de insertar el primer lote, se borran de la tabla todas las filas cuyo
// legajo esté presente en el archivo que se está importando.
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
    const { batch, legajosAEliminar, esPrimerLote } = body as {
      batch: unknown;
      legajosAEliminar: unknown;
      esPrimerLote: unknown;
    };

    if (!Array.isArray(batch)) {
      return NextResponse.json({ success: false, error: '"batch" debe ser un array.' }, { status: 400 });
    }

    if (esPrimerLote && Array.isArray(legajosAEliminar) && legajosAEliminar.length > 0) {
      for (let i = 0; i < legajosAEliminar.length; i += DELETE_CHUNK) {
        const chunk = legajosAEliminar.slice(i, i + DELETE_CHUNK);
        const { error } = await supabaseAdmin.from("inbound").delete().in("legajo", chunk);
        if (error) {
          throw new Error(`Supabase (inbound - borrado por legajo): ${error.message}`);
        }
      }
    }

    if (batch.length === 0) {
      return NextResponse.json({ success: true, filasInsertadas: 0 });
    }

    const { error, count } = await supabaseAdmin
      .from("inbound")
      .insert(batch as Record<string, unknown>[], { count: "exact" });

    if (error) {
      throw new Error(`Supabase (inbound - insert): ${error.message}`);
    }

    return NextResponse.json({ success: true, filasInsertadas: count ?? batch.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { invalidateCache } from "@/lib/queryCache";

export const runtime = "nodejs";

// -----------------------------------------------------------------------
// Mismo patrón que /api/pendiente-despacho/clientes/import: el archivo es
// una foto completa y vigente -> reemplazo total.
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
    const { batch, esPrimerLote } = body as { batch: unknown; esPrimerLote: unknown };

    if (!Array.isArray(batch)) {
      return NextResponse.json({ success: false, error: '"batch" debe ser un array.' }, { status: 400 });
    }

    if (esPrimerLote) {
      const { error: delError } = await supabaseAdmin.from("pendiente_despacho_propios").delete().not("id", "is", null);
      if (delError) {
        throw new Error(`Supabase (pendiente_despacho_propios - borrado total): ${delError.message}`);
      }
    }

    if (batch.length === 0) {
      return NextResponse.json({ success: true, filasInsertadas: 0 });
    }

    const { error, count } = await supabaseAdmin
      .from("pendiente_despacho_propios")
      .insert(batch as Record<string, unknown>[], { count: "exact" });

    if (error) {
      throw new Error(`Supabase (pendiente_despacho_propios - insert): ${error.message}`);
    }

    invalidateCache("pendiente_despacho:pendiente_despacho_propios");
    return NextResponse.json({ success: true, filasInsertadas: count ?? batch.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

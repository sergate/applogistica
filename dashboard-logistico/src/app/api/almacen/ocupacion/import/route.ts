import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { invalidateCache } from "@/lib/queryCache";

export const runtime = "nodejs";

// -----------------------------------------------------------------------
// El navegador ya limpió y pivoteó el archivo de ~740.000 filas a una
// "tabla dinámica" de combinaciones únicas (ubicacion, contenedor) con
// stock>0 -- acá solo llegan esos lotes chicos. En el primer lote se borra
// toda la tabla (foto completa y vigente de la ocupación) y cada lote hace
// upsert por si dos lotes llegaran a tocar la misma combinación.
// -----------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ALM-Importar");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { batch, esPrimerLote } = body as { batch: unknown; esPrimerLote: unknown };

    if (!Array.isArray(batch)) {
      return NextResponse.json({ success: false, error: '"batch" debe ser un array.' }, { status: 400 });
    }

    if (esPrimerLote) {
      const { error: delError } = await supabaseAdmin.from("almacen_ocupacion").delete().not("id", "is", null);
      if (delError) throw new Error(`Supabase (almacen_ocupacion - borrado total): ${delError.message}`);
    }

    invalidateCache("almacen_ocupacion:");

    if (batch.length === 0) {
      return NextResponse.json({ success: true, filasInsertadas: 0 });
    }

    const actualizadoAt = new Date().toISOString();
    const filas = (batch as Record<string, unknown>[])
      .map((f) => ({
        ubicacion: typeof f?.ubicacion === "string" ? f.ubicacion.trim() : "",
        contenedor: typeof f?.contenedor === "string" ? f.contenedor.trim() : "",
        unidades: Number(f?.unidades) || 0,
        actualizado_at: actualizadoAt,
      }))
      .filter((f) => f.ubicacion && f.contenedor);

    const { error, count } = await supabaseAdmin
      .from("almacen_ocupacion")
      .upsert(filas, { onConflict: "ubicacion,contenedor", count: "exact" });

    if (error) throw new Error(`Supabase (almacen_ocupacion - upsert): ${error.message}`);

    return NextResponse.json({ success: true, filasInsertadas: count ?? filas.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

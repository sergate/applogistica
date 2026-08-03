import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { invalidateCache } from "@/lib/queryCache";

export const runtime = "nodejs";

// El layout es chico (una fila por posición física, del orden de decenas de
// miles) -- el navegador lo manda entero en un solo request; acá se inserta
// en lotes internos para no pasarnos del límite de una sola query a Supabase.
const INSERT_CHUNK = 1000;

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ALM-ImportarLayout");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const filas = body?.filas;

    if (!Array.isArray(filas)) {
      return NextResponse.json({ success: false, error: '"filas" debe ser un array.' }, { status: 400 });
    }

    const limpio = (filas as Record<string, unknown>[])
      .map((f) => ({
        nave: typeof f?.nave === "string" ? f.nave.trim() || null : null,
        ubicacion: typeof f?.ubicacion === "string" ? f.ubicacion.trim() : "",
        zona: typeof f?.zona === "string" ? f.zona.trim() : "",
      }))
      .filter((f) => f.ubicacion && f.zona);

    // El layout es una foto completa y vigente del almacén -- se reemplaza entero.
    const { error: delError } = await supabaseAdmin.from("almacen_layout").delete().not("id", "is", null);
    if (delError) throw new Error(`Supabase (almacen_layout - borrado total): ${delError.message}`);

    for (let i = 0; i < limpio.length; i += INSERT_CHUNK) {
      const chunk = limpio.slice(i, i + INSERT_CHUNK);
      const { error } = await supabaseAdmin.from("almacen_layout").insert(chunk);
      if (error) throw new Error(`Supabase (almacen_layout - insert): ${error.message}`);
    }

    invalidateCache("almacen_layout:");

    return NextResponse.json({ success: true, filasInsertadas: limpio.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

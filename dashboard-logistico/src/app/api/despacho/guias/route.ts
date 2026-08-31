import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Sin chequeo de sesión, mismo criterio que el resto de las rutas de
// "resumen" de la app (ej. pendiente-despacho/clientes/resumen): el tab ya
// queda oculto client-side si el usuario no tiene el permiso correspondiente.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const vista = request.nextUrl.searchParams.get("vista");
    if (vista !== "imprimir" && vista !== "reimprimir") {
      return NextResponse.json({ success: false, error: 'Falta "vista" (imprimir|reimprimir).' }, { status: 400 });
    }

    let query = supabaseAdmin.from("despacho_guias").select("*").order("fecha_creacion", { ascending: false });
    query =
      vista === "reimprimir"
        ? query.eq("guia_impresa", true).eq("remito_impreso", true)
        : query.or("guia_impresa.eq.false,remito_impreso.eq.false");

    const { data, error } = await query;
    if (error) throw new Error(`Supabase (despacho_guias): ${error.message}`);

    let updatedAt: string | null = null;
    for (const fila of data || []) {
      if (fila.updated_at && (!updatedAt || fila.updated_at > updatedAt)) updatedAt = fila.updated_at;
    }

    return NextResponse.json({ success: true, filas: data || [], updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

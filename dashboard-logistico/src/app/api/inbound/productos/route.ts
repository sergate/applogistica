import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Trae el detalle de productos de un legajo puntual (lazy-load al desplegar
// la fila en Resumen -- la tabla completa puede tener muchas filas por legajo).
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const legajo = Number(request.nextUrl.searchParams.get("legajo"));
  if (!Number.isFinite(legajo)) {
    return NextResponse.json({ success: false, error: "Legajo inválido." }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("inbound_productos")
      .select("legajo, etapa, master, descripcion, marca, grupo")
      .eq("legajo", legajo)
      .order("master");

    if (error) throw new Error(`Supabase (inbound_productos): ${error.message}`);

    return NextResponse.json({ success: true, productos: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

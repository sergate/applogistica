import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Feriados");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("feriados")
      .select("id, fecha, descripcion")
      .order("fecha");

    if (error) throw new Error(`Supabase (feriados): ${error.message}`);

    return NextResponse.json({ success: true, feriados: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Feriados");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const fecha = typeof body?.fecha === "string" ? body.fecha.trim() : "";
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ success: false, error: "Fecha inválida (se espera YYYY-MM-DD)." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("feriados")
      .insert({ fecha, descripcion: descripcion || null })
      .select("id, fecha, descripcion")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505" ? "Esa fecha ya está cargada como feriado." : `Supabase (feriados): ${error.message}`
      );
    }

    return NextResponse.json({ success: true, feriado: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

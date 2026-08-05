import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PD-CargaDatos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("urgencias_contenedores")
      .select("id, contenedor, nota, created_at")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);

    return NextResponse.json({ success: true, contenedores: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Acepta uno o varios contenedores por request (pegar una lista completa de una).
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PD-CargaDatos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const contenedoresRaw: unknown = body?.contenedores;
    const nota = typeof body?.nota === "string" ? body.nota.trim() || null : null;

    if (!Array.isArray(contenedoresRaw)) {
      return NextResponse.json({ success: false, error: '"contenedores" debe ser un array.' }, { status: 400 });
    }

    const contenedores = Array.from(
      new Set(
        contenedoresRaw
          .map((c) => (typeof c === "string" ? c.trim() : ""))
          .filter((c) => c.length > 0)
      )
    );

    if (contenedores.length === 0) {
      return NextResponse.json({ success: false, error: "No se recibió ningún contenedor válido." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("urgencias_contenedores")
      .upsert(
        contenedores.map((contenedor) => ({ contenedor, nota })),
        { onConflict: "contenedor", ignoreDuplicates: true }
      )
      .select("id, contenedor, nota, created_at");

    if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);

    return NextResponse.json({ success: true, agregados: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Limpieza masiva: borra TODOS los contenedores cargados.
export async function DELETE() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PD-CargaDatos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { error } = await supabaseAdmin.from("urgencias_contenedores").delete().not("id", "is", null);
    if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

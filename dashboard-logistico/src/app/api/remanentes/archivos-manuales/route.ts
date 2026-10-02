import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { invalidateCache } from "@/lib/queryCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_SUPABASE = { success: false, error: "Faltan configurar las variables de Supabase." };

// Nombres de archivo de remanentes cargados a mano (Status Remanentes ->
// Carga Datos) -- ver sql/remanentes_archivos_manuales.sql.
export async function GET() {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAdminPermission("REM-Carga");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("remanentes_archivos_manuales")
      .select("id, archivo, nota, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase (remanentes_archivos_manuales): ${error.message}`);

    return NextResponse.json({ success: true, archivos: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Acepta uno o varios nombres por request (pegar una lista completa de una).
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAdminPermission("REM-Carga");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const archivosRaw: unknown = body?.archivos;
    const nota = typeof body?.nota === "string" ? body.nota.trim() || null : null;

    if (!Array.isArray(archivosRaw)) {
      return NextResponse.json({ success: false, error: '"archivos" debe ser un array.' }, { status: 400 });
    }

    // Se guarda con los espacios ya colapsados -- el match contra el combo del
    // WMS y contra remanentes.numero ignora mayúsculas y espacios de más.
    const archivos = Array.from(
      new Set(
        archivosRaw
          .map((a) => (typeof a === "string" ? a.trim().replace(/\s+/g, " ") : ""))
          .filter((a) => a.length > 0)
      )
    );

    if (archivos.length === 0) {
      return NextResponse.json({ success: false, error: "No se recibió ningún nombre de archivo válido." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("remanentes_archivos_manuales")
      .upsert(
        archivos.map((archivo) => ({ archivo, nota, usuario_id: auth.userId })),
        { onConflict: "archivo", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw new Error(`Supabase (remanentes_archivos_manuales): ${error.message}`);

    invalidateCache("remanentes_manuales:all");

    return NextResponse.json({ success: true, agregados: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAdminPermission("REM-Carga");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id)) return NextResponse.json({ success: false, error: "Id inválido." }, { status: 400 });

    const { error } = await supabaseAdmin.from("remanentes_archivos_manuales").delete().eq("id", id);
    if (error) throw new Error(`Supabase (remanentes_archivos_manuales): ${error.message}`);

    invalidateCache("remanentes_manuales:all");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

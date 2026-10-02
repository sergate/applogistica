import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_SUPABASE = { success: false, error: "Faltan configurar las variables de Supabase." };

// Archivos de Status Remanentes - Resumen que se sacaron de la vista (sin
// borrar sus filas de "remanentes") -- ver sql/remanentes_archivos_ocultos.sql.
export async function GET() {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin.from("remanentes_archivos_ocultos").select("archivo");
    if (error) throw new Error(`Supabase (remanentes_archivos_ocultos): ${error.message}`);
    return NextResponse.json({ success: true, archivos: (data || []).map((r) => r.archivo) });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAdminPermission("REM-OcultarArchivo");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const archivo = typeof body?.archivo === "string" ? body.archivo.trim() : "";
    if (!archivo) return NextResponse.json({ success: false, error: "Archivo inválido." }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("remanentes_archivos_ocultos")
      .upsert({ archivo, usuario_id: auth.userId }, { onConflict: "archivo" });
    if (error) throw new Error(`Supabase (remanentes_archivos_ocultos): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAdminPermission("REM-OcultarArchivo");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const archivo = typeof body?.archivo === "string" ? body.archivo.trim() : "";
    if (!archivo) return NextResponse.json({ success: false, error: "Archivo inválido." }, { status: 400 });

    const { error } = await supabaseAdmin.from("remanentes_archivos_ocultos").delete().eq("archivo", archivo);
    if (error) throw new Error(`Supabase (remanentes_archivos_ocultos): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

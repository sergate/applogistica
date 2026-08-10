import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Borra de la tabla "carga_inicial" todas las filas de un archivo importado
// (identificado por su "numero", el mismo valor que se muestra como
// "Archivo" en Status Carga Inicial - Resumen).
export async function DELETE(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("CI-EliminarArchivo");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const numero = typeof body?.numero === "string" ? body.numero.trim() : "";

    if (!numero) {
      return NextResponse.json({ success: false, error: "Archivo inválido." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("carga_inicial").delete().eq("numero", numero);
    if (error) throw new Error(`Supabase (carga_inicial): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

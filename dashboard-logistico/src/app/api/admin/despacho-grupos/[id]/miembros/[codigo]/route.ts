import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; codigo: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id, codigo } = await params;
    const { error } = await supabaseAdmin
      .from("despacho_grupos_clientes_miembros")
      .delete()
      .eq("grupo_id", id)
      .eq("codigo_cliente", codigo);
    if (error) throw new Error(`Supabase (despacho_grupos_clientes_miembros): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { invalidateCache } from "@/lib/queryCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("REMA Manual");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("pedidos_rema_manual").delete().eq("id", id);
    if (error) throw new Error(`Supabase (pedidos_rema_manual): ${error.message}`);

    invalidateCache("pedidos_rema_manual:");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

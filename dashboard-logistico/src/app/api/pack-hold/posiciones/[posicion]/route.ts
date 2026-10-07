import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { liberarPosicion } from "@/lib/packHold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Libera una posición registrada por error. Queda en el registro de eventos y
// no se puede si la guía está en un plan de recogida activo.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ posicion: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Liberar");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { posicion } = await params;
    const resultado = await liberarPosicion({ posicion: decodeURIComponent(posicion), userId: auth.userId });
    if (!resultado.ok) {
      return NextResponse.json({ success: false, error: resultado.mensaje }, { status: resultado.status });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

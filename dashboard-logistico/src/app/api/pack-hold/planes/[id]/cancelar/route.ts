import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { cancelarPlan } from "@/lib/packHoldPlanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancela un plan activo: las guías vuelven a quedar libres para otro plan y
// sus posiciones siguen ocupadas.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Planes");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const planId = Number((await params).id);
    if (!Number.isInteger(planId)) {
      return NextResponse.json({ success: false, error: "Plan inválido." }, { status: 400 });
    }
    const resultado = await cancelarPlan({ planId, userId: auth.userId });
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

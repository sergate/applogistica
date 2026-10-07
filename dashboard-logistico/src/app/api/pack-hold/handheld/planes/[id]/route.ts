import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchPlanes } from "@/lib/packHoldPlanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Handheld: el plan elegido con sus posiciones ordenadas de menor a mayor y cuáles ya se recogieron.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Handheld");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const planId = Number((await params).id);
    if (!Number.isInteger(planId)) {
      return NextResponse.json({ success: false, error: "Plan inválido." }, { status: 400 });
    }
    const [plan] = await fetchPlanes({ conCerrados: false, planId });
    if (!plan) return NextResponse.json({ success: false, error: "El plan no existe." }, { status: 404 });
    return NextResponse.json({ success: true, plan });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

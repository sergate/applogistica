import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { recogerPosicion } from "@/lib/packHoldPlanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Handheld, "Despacho": posición + un contenedor cualquiera de la guía que
// está ahí. Al cumplir todas las posiciones, el plan se cierra solo.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Handheld");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const planId = Number((await params).id);
    const body = await request.json().catch(() => null);
    const contenedor = typeof body?.contenedor === "string" ? body.contenedor : "";
    const posicion = typeof body?.posicion === "string" ? body.posicion : "";
    if (!Number.isInteger(planId) || !contenedor.trim() || !posicion.trim()) {
      return NextResponse.json({ success: false, error: "Faltan el plan, la posición y el contenedor." }, { status: 400 });
    }

    const resultado = await recogerPosicion({ planId, posicion, contenedor, userId: auth.userId });
    if (!resultado.ok) {
      return NextResponse.json(
        { success: false, codigo: resultado.codigo, error: resultado.mensaje },
        { status: resultado.status }
      );
    }
    return NextResponse.json({ success: true, ...resultado });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

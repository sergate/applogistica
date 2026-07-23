import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("INB-EditarArribo");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const legajo = Number(body?.legajo);
    const arriboCd = typeof body?.arriboCd === "string" ? body.arriboCd.trim() : "";

    if (!Number.isFinite(legajo)) {
      return NextResponse.json({ success: false, error: "Legajo inválido." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arriboCd)) {
      return NextResponse.json({ success: false, error: "Fecha inválida (se espera YYYY-MM-DD)." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("inbound")
      .update({ arribo_cd: arriboCd, updated_at: new Date().toISOString() })
      .eq("legajo", legajo);

    if (error) throw new Error(`Supabase (inbound): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

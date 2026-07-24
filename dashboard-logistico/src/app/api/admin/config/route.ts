import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Configuracion");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("id, notification_email")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(`Supabase (app_config): ${error.message}`);

    return NextResponse.json({ success: true, config: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Configuracion");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const notificationEmail = typeof body?.notificationEmail === "string" ? body.notificationEmail.trim() : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) {
      return NextResponse.json({ success: false, error: "Email inválido." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("app_config")
      .upsert({ id: 1, notification_email: notificationEmail }, { onConflict: "id" })
      .select("id, notification_email")
      .single();

    if (error) throw new Error(`Supabase (app_config): ${error.message}`);

    return NextResponse.json({ success: true, config: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

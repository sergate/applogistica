import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false }, { status: 500 });
  }

  try {
    const authClient = await createServerAuthClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const subseccionKey = typeof body?.subseccionKey === "string" ? body.subseccionKey : null;
    if (!subseccionKey) {
      return NextResponse.json({ success: false, error: '"subseccionKey" requerido.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("log_accesos")
      .insert({ usuario_id: user.id, subseccion_key: subseccionKey });

    if (error) {
      throw new Error(`Supabase (log_accesos): ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

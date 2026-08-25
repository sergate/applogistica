import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeSesion } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: indica si el usuario ya tiene un token generado (no devuelve el valor,
// una vez generado solo se ve la primera vez -- igual que un secreto de API).
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeSesion();
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { data } = await supabaseAdmin
      .from("agente_tokens")
      .select("created_at")
      .eq("usuario_id", auth.userId)
      .maybeSingle();

    return NextResponse.json({ success: true, tieneToken: !!data, generadoEn: data?.created_at ?? null });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// POST: genera un token nuevo para el Agente Local (pisa el anterior, que
// deja de servir). Se muestra una sola vez en la respuesta.
export async function POST() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeSesion();
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const token = randomBytes(32).toString("base64url");

    const { error } = await supabaseAdmin
      .from("agente_tokens")
      .upsert({ usuario_id: auth.userId, token, created_at: new Date().toISOString() }, { onConflict: "usuario_id" });

    if (error) throw new Error(`Supabase (agente_tokens): ${error.message}`);

    return NextResponse.json({ success: true, token });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Solo informativo, para mostrarlo en el formulario mientras se completa --
// no reserva el número. El que realmente queda asignado sale recién al
// guardar (POST/PATCH de /api/interlocales), de forma atómica.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("interlocales_contador_varios")
      .select("ultimo_numero")
      .eq("id", 1)
      .single();
    if (error) throw new Error(`Supabase (interlocales_contador_varios): ${error.message}`);

    return NextResponse.json({ success: true, proximoNumero: (data?.ultimo_numero || 0) + 1 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

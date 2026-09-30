import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { obtenerOCrearVacacionesId } from "@/lib/personalVacacionesServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Carga (o corrige) los días de vacaciones tomados en una semana puntual
// del ciclo vigente -- el saldo se recalcula solo al leer /api/personal/vacaciones,
// restando la suma de todas las cargas del empleado.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ dotacionId: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { dotacionId } = await params;
    const body = await request.json();
    const semanaInicio = typeof body?.semanaInicio === "string" ? body.semanaInicio : "";
    const dias = Number(body?.dias);

    if (!semanaInicio || Number.isNaN(dias) || dias < 0) {
      return NextResponse.json({ success: false, error: "Faltan semanaInicio/dias válidos." }, { status: 400 });
    }

    const vacacionesId = await obtenerOCrearVacacionesId(Number(dotacionId));

    const { error } = await supabaseAdmin
      .from("personal_cd_vacaciones_cargas")
      .upsert(
        { vacaciones_id: vacacionesId, semana_inicio: semanaInicio, dias, updated_at: new Date().toISOString() },
        { onConflict: "vacaciones_id,semana_inicio" }
      );
    if (error) throw new Error(`Supabase (personal_cd_vacaciones_cargas): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

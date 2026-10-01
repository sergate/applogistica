import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";
import { obtenerOCrearVacacionesId } from "@/lib/personalVacacionesServer";
import { registrarAuditoria } from "@/lib/personalAuditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar Vac. Adeudadas y/o pisar a mano Vac. Actuales (null = volver al
// cálculo automático por antigüedad).
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

    const updates: Record<string, unknown> = {};
    if ("adeudadas" in body) {
      const n = Number(body.adeudadas);
      if (Number.isNaN(n) || n < 0) return NextResponse.json({ success: false, error: "adeudadas inválido." }, { status: 400 });
      updates.vacaciones_adeudadas = n;
    }
    if ("actualesManual" in body) {
      if (body.actualesManual === null) {
        updates.vacaciones_actuales_manual = null;
      } else {
        const n = Number(body.actualesManual);
        if (Number.isNaN(n) || n < 0) return NextResponse.json({ success: false, error: "actualesManual inválido." }, { status: 400 });
        updates.vacaciones_actuales_manual = n;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para actualizar." }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const { data: empleado } = await supabaseAdmin
      .from("personal_cd_dotacion")
      .select("legajo, apellido_nombre")
      .eq("id", dotacionId)
      .single();

    const vacacionesId = await obtenerOCrearVacacionesId(Number(dotacionId));

    const { data: previo } = await supabaseAdmin
      .from("personal_cd_vacaciones")
      .select("vacaciones_adeudadas, vacaciones_actuales_manual")
      .eq("id", vacacionesId)
      .single();

    const { error } = await supabaseAdmin.from("personal_cd_vacaciones").update(updates).eq("id", vacacionesId);
    if (error) throw new Error(`Supabase (personal_cd_vacaciones): ${error.message}`);

    const quien = empleado ? `${empleado.apellido_nombre} (legajo ${empleado.legajo})` : `empleado ${dotacionId}`;

    if ("vacaciones_adeudadas" in updates && Number(previo?.vacaciones_adeudadas) !== updates.vacaciones_adeudadas) {
      await registrarAuditoria({
        usuarioId: auth.userId,
        dotacionId: Number(dotacionId),
        legajo: empleado?.legajo,
        accion: "edicion_vacaciones_adeudadas",
        detalle: `${quien}: Vac. Adeudadas ${previo?.vacaciones_adeudadas ?? 0} -> ${updates.vacaciones_adeudadas}.`,
      });
    }

    if ("vacaciones_actuales_manual" in updates && (previo?.vacaciones_actuales_manual ?? null) !== updates.vacaciones_actuales_manual) {
      const anteriorTxto = previo?.vacaciones_actuales_manual ?? "automático";
      const nuevoTxto = updates.vacaciones_actuales_manual ?? "automático";
      await registrarAuditoria({
        usuarioId: auth.userId,
        dotacionId: Number(dotacionId),
        legajo: empleado?.legajo,
        accion: "edicion_vacaciones_actuales",
        detalle: `${quien}: Vac. Actuales ${anteriorTxto} -> ${nuevoTxto}.`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

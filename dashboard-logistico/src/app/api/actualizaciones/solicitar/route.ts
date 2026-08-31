import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import {
  esErrorAuth,
  esSeccionValida,
  SECCIONES_CON_PAYLOAD_VARIABLE,
  tienePermisoSeccion,
  usuarioDesdeSesion,
} from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Si un pedido quedó "corriendo" hace más de esto sin cerrarse, se considera
// abandonado (el Agente se cortó/crasheó a mitad de camino) y no se reusa --
// si no, un pedido trabado bloquearía el botón para siempre. 20 min (no 10)
// porque "ocupacion_almacen" baja y procesa un archivo de 100+ MB y puede
// tardar bastante más que el resto de las secciones.
const MINUTOS_CORRIENDO_ABANDONADO = 20;

// Crea un pedido de actualización para el usuario logueado. Si ya tiene uno
// pendiente/corriendo (y no abandonado) para la misma sección, lo reusa en
// vez de duplicar (evita que dos clicks seguidos disparen dos corridas del
// Agente).
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeSesion();
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const seccion = body?.seccion;
    const payload = body?.payload ?? null;
    if (!esSeccionValida(seccion)) {
      return NextResponse.json({ success: false, error: "Sección inválida." }, { status: 400 });
    }

    if (!(await tienePermisoSeccion(auth.userId, seccion))) {
      return NextResponse.json(
        { success: false, error: "No tenés permiso para actualizar esta sección." },
        { status: 403 }
      );
    }

    const { data: existente } = await supabaseAdmin
      .from("actualizaciones_wms")
      .select("id, estado, started_at")
      .eq("usuario_id", auth.userId)
      .eq("seccion", seccion)
      .in("estado", ["pendiente", "corriendo"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const abandonado =
      existente?.estado === "corriendo" &&
      !!existente.started_at &&
      Date.now() - new Date(existente.started_at).getTime() > MINUTOS_CORRIENDO_ABANDONADO * 60_000;

    if (existente && !abandonado) {
      // Estas secciones llevan un payload distinto en cada click (ej. qué
      // guías se seleccionaron) -- reusar el pedido anterior equivaldría a
      // ignorar en silencio la selección nueva del usuario, así que en vez
      // de reusar se avisa que ya hay uno en curso.
      if (SECCIONES_CON_PAYLOAD_VARIABLE.includes(seccion)) {
        return NextResponse.json(
          { success: false, error: "Ya tenés una impresión en curso, esperá a que termine." },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, id: existente.id, estado: existente.estado, reusado: true });
    }

    if (abandonado) {
      await supabaseAdmin
        .from("actualizaciones_wms")
        .update({
          estado: "error",
          mensaje: "El Agente no respondió a tiempo (pedido abandonado, probablemente se cerró a mitad de camino).",
          finished_at: new Date().toISOString(),
        })
        .eq("id", existente!.id);
    }

    const { data: nuevo, error } = await supabaseAdmin
      .from("actualizaciones_wms")
      .insert({ usuario_id: auth.userId, seccion, estado: "pendiente", payload })
      .select("id, estado")
      .single();

    if (error) throw new Error(`Supabase (actualizaciones_wms): ${error.message}`);

    return NextResponse.json({ success: true, id: nuevo.id, estado: nuevo.estado, reusado: false });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

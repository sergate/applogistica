import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, tienePermisoSeccion, usuarioDesdeSesion } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANTIDAD_MAXIMA = 200;
// Mismo criterio que /api/actualizaciones/solicitar: un pedido "corriendo"
// hace más de esto sin cerrarse se considera abandonado (Agente cortado a
// mitad de camino) y no bloquea el botón para siempre.
const MINUTOS_CORRIENDO_ABANDONADO = 20;

function textoEtiqueta(numero: number): string {
  return `interlocal-${String(numero).padStart(5, "0")}`;
}

// Reserva un lote de números correlativos, los registra en el log (para que
// sea imposible repetir uno) y encola la impresión para que la atienda el
// Agente Local -- manda el ZPL directo por red a la Zebra, no pasa por el
// navegador.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await usuarioDesdeSesion();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  if (!(await tienePermisoSeccion(auth.userId, "exp_etiquetas"))) {
    return NextResponse.json({ success: false, error: "No tenés permiso para imprimir etiquetas." }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const cantidad = Number(body?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > CANTIDAD_MAXIMA) {
      return NextResponse.json(
        { success: false, error: `La cantidad tiene que ser un entero entre 1 y ${CANTIDAD_MAXIMA}.` },
        { status: 400 }
      );
    }

    const { data: existente } = await supabaseAdmin
      .from("actualizaciones_wms")
      .select("id, estado, started_at")
      .eq("usuario_id", auth.userId)
      .eq("seccion", "exp_etiquetas")
      .in("estado", ["pendiente", "corriendo"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const abandonado =
      existente?.estado === "corriendo" &&
      !!existente.started_at &&
      Date.now() - new Date(existente.started_at).getTime() > MINUTOS_CORRIENDO_ABANDONADO * 60_000;

    if (existente && !abandonado) {
      return NextResponse.json(
        { success: false, error: "Ya tenés una impresión de etiquetas en curso, esperá a que termine." },
        { status: 409 }
      );
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

    const { data: numeros, error: errorReserva } = await supabaseAdmin.rpc("reservar_numeros_etiqueta_interlocal", {
      cantidad,
    });
    if (errorReserva) throw new Error(`Supabase (reservar_numeros_etiqueta_interlocal): ${errorReserva.message}`);
    if (!Array.isArray(numeros) || numeros.length !== cantidad) {
      throw new Error("No se pudieron reservar los números de etiqueta.");
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();
    const textos = (numeros as number[]).map(textoEtiqueta);

    const { error: errorLog } = await supabaseAdmin.from("interlocales_etiquetas_impresas").insert(
      (numeros as number[]).map((numero) => ({
        numero,
        texto: textoEtiqueta(numero),
        impreso_por_id: auth.userId,
        impreso_por_nombre: usuario?.nombre || null,
      }))
    );
    if (errorLog) throw new Error(`Supabase (interlocales_etiquetas_impresas): ${errorLog.message}`);

    const { data: pedido, error: errorPedido } = await supabaseAdmin
      .from("actualizaciones_wms")
      .insert({ usuario_id: auth.userId, seccion: "exp_etiquetas", estado: "pendiente", payload: { textos } })
      .select("id, estado")
      .single();
    if (errorPedido) throw new Error(`Supabase (actualizaciones_wms): ${errorPedido.message}`);

    return NextResponse.json({ success: true, id: pedido.id, estado: pedido.estado, textos });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

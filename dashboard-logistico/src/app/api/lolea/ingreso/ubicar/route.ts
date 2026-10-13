import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { normalizarPosicionLol, registrarEventoLol, UBICACION_STAGE, ZONA_LOLEA } from "@/lib/lolea";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ubicar desde el stage: el maquinista indica cuántos transfiere a una posición
// (puede ser parcial, uno por cada pallet). La posición tiene que existir en el
// layout de Lolea; el resto lo valida lol_ubicar con el stage bloqueado.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("LOL-Ingreso");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const skuId = Number(body?.skuId);
    const cantidad = Number(body?.cantidad);
    const posicion = typeof body?.posicion === "string" ? normalizarPosicionLol(body.posicion) : "";

    if (!Number.isInteger(skuId) || skuId < 1) {
      return NextResponse.json({ success: false, error: "Elegí el artículo y la variante." }, { status: 400 });
    }
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      return NextResponse.json(
        { success: false, error: "La cantidad tiene que ser un entero de 1 en adelante." },
        { status: 400 }
      );
    }
    if (!posicion || posicion === UBICACION_STAGE) {
      return NextResponse.json({ success: false, error: "Falta escanear la posición." }, { status: 400 });
    }

    const fallo = async (mensaje: string, status: number) => {
      await registrarEventoLol({
        tipo: "ubicacion",
        skuId,
        ubicacion: posicion,
        cantidad,
        resultado: "error",
        mensaje,
        usuarioId: auth.userId,
      });
      return NextResponse.json({ success: false, error: mensaje }, { status });
    };

    const { data: enLayout, error: errorLayout } = await supabaseAdmin
      .from("almacen_layout")
      .select("ubicacion")
      .eq("zona", ZONA_LOLEA)
      .eq("ubicacion", posicion)
      .limit(1);
    if (errorLayout) throw new Error(`Supabase (almacen_layout): ${errorLayout.message}`);
    if (!enLayout || enLayout.length === 0) {
      return fallo(`${posicion} no existe en el layout de Lolea.`, 400);
    }

    const { data, error } = await supabaseAdmin.rpc("lol_ubicar", {
      p_sku: skuId,
      p_cantidad: cantidad,
      p_posicion: posicion,
      p_usuario: auth.userId,
    });
    if (error) {
      const esDeNegocio = error.code === "P0001";
      return fallo(esDeNegocio ? error.message : `Supabase (lol_ubicar): ${error.message}`, esDeNegocio ? 409 : 500);
    }

    const fila = (Array.isArray(data) ? data[0] : data) as { stage_restante: number; en_posicion: number } | undefined;
    await registrarEventoLol({
      tipo: "ubicacion",
      skuId,
      ubicacion: posicion,
      cantidad,
      resultado: "ok",
      usuarioId: auth.userId,
    });
    return NextResponse.json({
      success: true,
      posicion,
      stageRestante: fila?.stage_restante ?? null,
      enPosicion: fila?.en_posicion ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

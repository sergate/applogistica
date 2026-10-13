import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { registrarEventoLol, UBICACION_STAGE } from "@/lib/lolea";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recibir mercadería: todo lo que llega entra al stage, sin límite. La función
// lol_recibir suma al stage y deja el movimiento en la misma transacción.
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
    const referencia = typeof body?.referencia === "string" ? body.referencia.trim().slice(0, 120) : "";

    if (!Number.isInteger(skuId) || skuId < 1) {
      return NextResponse.json({ success: false, error: "Elegí el artículo y la variante." }, { status: 400 });
    }
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      return NextResponse.json(
        { success: false, error: "La cantidad tiene que ser un entero de 1 en adelante." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("lol_recibir", {
      p_sku: skuId,
      p_cantidad: cantidad,
      p_usuario: auth.userId,
      p_referencia: referencia || null,
    });

    if (error) {
      // P0001 = RAISE EXCEPTION de la función: el mensaje es para el usuario.
      const esDeNegocio = error.code === "P0001";
      await registrarEventoLol({
        tipo: "recepcion",
        skuId,
        ubicacion: UBICACION_STAGE,
        cantidad,
        resultado: "error",
        mensaje: error.message,
        usuarioId: auth.userId,
      });
      return NextResponse.json(
        { success: false, error: esDeNegocio ? error.message : `Supabase (lol_recibir): ${error.message}` },
        { status: esDeNegocio ? 400 : 500 }
      );
    }

    await registrarEventoLol({
      tipo: "recepcion",
      skuId,
      ubicacion: UBICACION_STAGE,
      cantidad,
      resultado: "ok",
      mensaje: referencia || null,
      usuarioId: auth.userId,
    });
    return NextResponse.json({ success: true, stage: data as number });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

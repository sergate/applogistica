import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllTiendasDestino,
  fetchClientesInfo,
  esEstadoContable,
  num,
} from "@/lib/resumenHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const [tiendas, clientes] = await Promise.all([fetchAllTiendasDestino(), fetchClientesInfo()]);

    let updatedAt: string | null = null;

    const filas = tiendas
      .filter((t) => esEstadoContable(t.estado_pedido))
      .map((t) => {
        const codigoTienda = t.tiendas_destino || "SIN TIENDA";
        const cliente = clientes.get(codigoTienda);
        const uni = num(t.uni);
        const pick = num(t.uni_pick);
        const sep = num(t.uni_sep);

        if (t.fecha_creacion && (!updatedAt || t.fecha_creacion > updatedAt)) {
          updatedAt = t.fecha_creacion;
        }

        return {
          pedido: t.pedido,
          codigoTienda,
          cliente: cliente?.nombre || "SIN CLIENTE",
          nombrePedido: t.nombre_pedido || "",
          marca: (t.seller || "").trim() || "SIN SELLER",
          canal: cliente?.canal || "SIN CANAL",
          fecha: t.fecha_creacion ? t.fecha_creacion.slice(0, 10) : "SIN FECHA",
          uni,
          pick,
          sep,
          pendPick: uni - pick,
          pendSep: uni - sep,
          eficPick: uni > 0 ? (pick / uni) * 100 : 0,
          eficSep: uni > 0 ? (sep / uni) * 100 : 0,
        };
      });

    return NextResponse.json({ success: true, filas, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

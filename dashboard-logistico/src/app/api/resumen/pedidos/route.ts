import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllGrupoPedidos,
  esContable,
  num,
  ultimaActualizacion,
  fetchTiendasPorPedido,
  fetchClientesInfo,
  resolverTiendaCliente,
} from "@/lib/resumenHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Se queda con la parte "YYYY-MM-DD" de un timestamp ISO. */
function soloFecha(iso: string | null): string {
  if (!iso) return "SIN FECHA";
  return iso.slice(0, 10);
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const rows = await fetchAllGrupoPedidos();
    const contables = rows.filter(esContable);

    // Todos los números (unidades, pickeadas, separadas) salen de grupo_pedidos,
    // agregados por pedido (un pedido tiene varias líneas, una por "grupo").
    const porPedido = new Map<
      string,
      { fecha: string; marca: string; nombrePedido: string; uni: number; pick: number; sep: number }
    >();

    for (const r of contables) {
      if (!porPedido.has(r.pedido)) {
        porPedido.set(r.pedido, {
          fecha: soloFecha(r.fecha_creacion),
          marca: (r.seller || "").trim() || "SIN SELLER",
          nombrePedido: r.nombre_pedido || "",
          uni: 0,
          pick: 0,
          sep: 0,
        });
      }
      const acc = porPedido.get(r.pedido)!;
      acc.uni += num(r.uni);
      acc.pick += num(r.uni_pick);
      acc.sep += num(r.uni_sep);
    }

    // tiendas_destino + clientes se usan SOLO para resolver código de tienda,
    // nombre de cliente y canal -- no aportan unidades.
    const [tiendasPorPedido, clientesInfo] = await Promise.all([
      fetchTiendasPorPedido(),
      fetchClientesInfo(),
    ]);

    const filas = Array.from(porPedido.entries()).map(([pedido, acc]) => {
      const { codigoTienda, nombre, canal } = resolverTiendaCliente(pedido, tiendasPorPedido, clientesInfo);

      return {
        pedido,
        codigoTienda,
        cliente: nombre,
        nombrePedido: acc.nombrePedido,
        marca: acc.marca,
        canal,
        fecha: acc.fecha,
        uni: acc.uni,
        pick: acc.pick,
        sep: acc.sep,
        pendPick: acc.uni - acc.pick,
        pendSep: acc.uni - acc.sep,
        eficPick: acc.uni > 0 ? (acc.pick / acc.uni) * 100 : 0,
        eficSep: acc.uni > 0 ? (acc.sep / acc.uni) * 100 : 0,
      };
    });

    return NextResponse.json({ success: true, filas, updatedAt: ultimaActualizacion(rows) });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

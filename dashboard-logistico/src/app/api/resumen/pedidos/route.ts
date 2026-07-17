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

    // Fecha, marca y nombre de pedido son consistentes dentro de un mismo
    // pedido (todas sus líneas comparten esos valores).
    const metaPorPedido = new Map<string, { fecha: string; marca: string; nombrePedido: string }>();
    for (const r of contables) {
      if (!metaPorPedido.has(r.pedido)) {
        metaPorPedido.set(r.pedido, {
          fecha: soloFecha(r.fecha_creacion),
          marca: (r.seller || "").trim() || "SIN SELLER",
          nombrePedido: r.nombre_pedido || "",
        });
      }
    }

    // tiendas_destino + clientes se usan SOLO para resolver código de tienda,
    // nombre de cliente y canal -- no aportan unidades.
    const [tiendasPorPedido, clientesInfo] = await Promise.all([
      fetchTiendasPorPedido(),
      fetchClientesInfo(),
    ]);

    // Agregamos por (pedido, grupo) -- mantenemos "grupo" para poder filtrar
    // por él en el frontend sin perder precisión (la lista se sigue mostrando
    // consolidada por pedido, pero el filtro de grupo actúa sobre este detalle).
    const porPedidoGrupo = new Map<
      string,
      { pedido: string; grupo: string; uni: number; pick: number; sep: number }
    >();

    for (const r of contables) {
      const grupoNombre = (r.grupo || "").trim() || "SIN GRUPO";
      const key = `${r.pedido}__${grupoNombre}`;
      if (!porPedidoGrupo.has(key)) {
        porPedidoGrupo.set(key, { pedido: r.pedido, grupo: grupoNombre, uni: 0, pick: 0, sep: 0 });
      }
      const acc = porPedidoGrupo.get(key)!;
      acc.uni += num(r.uni);
      acc.pick += num(r.uni_pick);
      acc.sep += num(r.uni_sep);
    }

    const filas = Array.from(porPedidoGrupo.values()).map((g) => {
      const meta = metaPorPedido.get(g.pedido)!;
      const { codigoTienda, nombre, canal } = resolverTiendaCliente(g.pedido, tiendasPorPedido, clientesInfo);

      return {
        pedido: g.pedido,
        grupo: g.grupo,
        codigoTienda,
        cliente: nombre,
        nombrePedido: meta.nombrePedido,
        marca: meta.marca,
        canal,
        fecha: meta.fecha,
        uni: g.uni,
        pick: g.pick,
        sep: g.sep,
        pendPick: g.uni - g.pick,
        pendSep: g.uni - g.sep,
        eficPick: g.uni > 0 ? (g.pick / g.uni) * 100 : 0,
        eficSep: g.uni > 0 ? (g.sep / g.uni) * 100 : 0,
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

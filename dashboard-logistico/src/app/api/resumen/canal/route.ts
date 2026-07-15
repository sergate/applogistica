import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllGrupoPedidos, esContable, num } from "@/lib/resumenHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const IN_CHUNK = 200; // troceamos los .in() para no mandar cláusulas gigantes

/**
 * Para una lista de pedidos, devuelve el código de tienda destino de cada uno
 * (nos quedamos con la primera fila que aparezca para ese pedido).
 */
async function fetchTiendaPorPedido(pedidos: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (let i = 0; i < pedidos.length; i += IN_CHUNK) {
    const chunk = pedidos.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("tiendas_destino")
      .select("pedido, tiendas_destino")
      .in("pedido", chunk);

    if (error) {
      throw new Error(`Supabase (tiendas_destino): ${error.message}`);
    }

    for (const row of data ?? []) {
      const codigoTienda = row.tiendas_destino as string | null;
      if (!map.has(row.pedido) && codigoTienda) {
        map.set(row.pedido, codigoTienda);
      }
    }
  }

  return map;
}

/** Trae toda la tabla clientes y arma un mapa código de tienda -> canal. */
async function fetchCanalPorCodigoTienda(): Promise<Map<string, string>> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const map = new Map<string, string>();

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .select("codigo, canal")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (clientes): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.codigo) map.set(row.codigo, (row.canal as string | null) || "SIN CANAL");
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return map;
}

export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const marca = request.nextUrl.searchParams.get("marca");
  if (!marca) {
    return NextResponse.json(
      { success: false, error: 'Falta el parámetro "marca".' },
      { status: 400 }
    );
  }

  try {
    const rows = await fetchAllGrupoPedidos();
    const marcaTrim = marca.trim();
    const contables = rows.filter(
      (r) => esContable(r) && ((r.seller || "").trim() || "SIN SELLER") === marcaTrim
    );

    // El canal se define a nivel PEDIDO (no a nivel línea/grupo), así que
    // primero sumamos las unidades de cada pedido dentro de esta marca.
    const porPedido = new Map<string, { uni: number; pick: number; sep: number }>();
    for (const r of contables) {
      if (!porPedido.has(r.pedido)) {
        porPedido.set(r.pedido, { uni: 0, pick: 0, sep: 0 });
      }
      const acc = porPedido.get(r.pedido)!;
      acc.uni += num(r.uni);
      acc.pick += num(r.uni_pick);
      acc.sep += num(r.uni_sep);
    }

    const pedidos = Array.from(porPedido.keys());
    const [tiendaPorPedido, canalPorCodigo] = await Promise.all([
      fetchTiendaPorPedido(pedidos),
      fetchCanalPorCodigoTienda(),
    ]);

    const porCanal = new Map<
      string,
      { uni: number; pick: number; sep: number; pedidos: Set<string> }
    >();

    for (const [pedido, acc] of porPedido) {
      const codigoTienda = tiendaPorPedido.get(pedido);
      const canal = (codigoTienda && canalPorCodigo.get(codigoTienda)) || "SIN CANAL";

      if (!porCanal.has(canal)) {
        porCanal.set(canal, { uni: 0, pick: 0, sep: 0, pedidos: new Set() });
      }
      const c = porCanal.get(canal)!;
      c.uni += acc.uni;
      c.pick += acc.pick;
      c.sep += acc.sep;
      c.pedidos.add(pedido);
    }

    const canales = Array.from(porCanal.entries())
      .map(([name, acc]) => ({
        name,
        uni: acc.uni,
        pick: acc.pick,
        sep: acc.sep,
        pendPick: acc.uni - acc.pick,
        pendSep: acc.uni - acc.sep,
        eficPick: acc.uni > 0 ? (acc.pick / acc.uni) * 100 : 0,
        eficSep: acc.uni > 0 ? (acc.sep / acc.uni) * 100 : 0,
        reg: acc.pedidos.size,
      }))
      .sort((a, b) => b.uni - a.uni);

    return NextResponse.json({ success: true, marca: marcaTrim, canales });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllGrupoPedidos,
  esContable,
  num,
  ultimaActualizacion,
  fetchTiendasPorPedido,
  fetchCanalPorCodigoTienda,
  resolverCanal,
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

    // Fecha y marca son consistentes dentro de un mismo pedido (todas sus
    // líneas comparten esos valores), así que armamos un mapa auxiliar.
    const metaPorPedido = new Map<string, { fecha: string; marca: string }>();
    for (const r of contables) {
      if (!metaPorPedido.has(r.pedido)) {
        metaPorPedido.set(r.pedido, {
          fecha: soloFecha(r.fecha_creacion),
          marca: (r.seller || "").trim() || "SIN SELLER",
        });
      }
    }

    const [tiendasPorPedido, canalPorCodigo] = await Promise.all([
      fetchTiendasPorPedido(),
      fetchCanalPorCodigoTienda(),
    ]);

    // El canal se resuelve por pedido; lo cacheamos para no recalcularlo en
    // cada línea (un pedido tiene varias líneas, una por grupo).
    const canalPorPedido = new Map<string, string>();
    const getCanal = (pedido: string) => {
      if (!canalPorPedido.has(pedido)) {
        canalPorPedido.set(pedido, resolverCanal(pedido, tiendasPorPedido, canalPorCodigo));
      }
      return canalPorPedido.get(pedido)!;
    };

    // Agrupamos por (fecha, marca, canal, grupo) -- mantenemos "grupo" para
    // poder filtrar por él en el frontend sin perder precisión.
    const grupos = new Map<
      string,
      { fecha: string; marca: string; canal: string; grupo: string; uni: number; pick: number; sep: number }
    >();

    for (const r of contables) {
      const meta = metaPorPedido.get(r.pedido)!;
      const canal = getCanal(r.pedido);
      const grupoNombre = (r.grupo || "").trim() || "SIN GRUPO";
      const key = `${meta.fecha}__${meta.marca}__${canal}__${grupoNombre}`;

      if (!grupos.has(key)) {
        grupos.set(key, { fecha: meta.fecha, marca: meta.marca, canal, grupo: grupoNombre, uni: 0, pick: 0, sep: 0 });
      }
      const g = grupos.get(key)!;
      g.uni += num(r.uni);
      g.pick += num(r.uni_pick);
      g.sep += num(r.uni_sep);
    }

    const filas = Array.from(grupos.values())
      .map((g) => ({
        fecha: g.fecha,
        marca: g.marca,
        canal: g.canal,
        grupo: g.grupo,
        uni: g.uni,
        pick: g.pick,
        sep: g.sep,
        pendPick: g.uni - g.pick,
        pendSep: g.uni - g.sep,
        eficPick: g.uni > 0 ? (g.pick / g.uni) * 100 : 0,
        eficSep: g.uni > 0 ? (g.sep / g.uni) * 100 : 0,
      }))
      // Más reciente primero; dentro de una misma fecha, mayor volumen primero.
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.uni - a.uni));

    return NextResponse.json({ success: true, filas, updatedAt: ultimaActualizacion(rows) });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

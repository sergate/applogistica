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

    // El canal se resuelve a nivel PEDIDO (no a nivel línea/grupo), así que
    // primero agregamos fecha/marca/unidades por pedido.
    const porPedido = new Map<
      string,
      { fecha: string; marca: string; uni: number; pick: number; sep: number }
    >();

    for (const r of contables) {
      if (!porPedido.has(r.pedido)) {
        porPedido.set(r.pedido, {
          fecha: soloFecha(r.fecha_creacion),
          marca: (r.seller || "").trim() || "SIN SELLER",
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

    const [tiendasPorPedido, canalPorCodigo] = await Promise.all([
      fetchTiendasPorPedido(),
      fetchCanalPorCodigoTienda(),
    ]);

    // Agrupamos por (fecha, marca, canal)
    const grupos = new Map<
      string,
      { fecha: string; marca: string; canal: string; uni: number; pick: number; sep: number }
    >();

    for (const [pedido, acc] of porPedido) {
      const canal = resolverCanal(pedido, tiendasPorPedido, canalPorCodigo);
      const key = `${acc.fecha}__${acc.marca}__${canal}`;

      if (!grupos.has(key)) {
        grupos.set(key, { fecha: acc.fecha, marca: acc.marca, canal, uni: 0, pick: 0, sep: 0 });
      }
      const g = grupos.get(key)!;
      g.uni += acc.uni;
      g.pick += acc.pick;
      g.sep += acc.sep;
    }

    const filas = Array.from(grupos.values())
      .map((g) => ({
        fecha: g.fecha,
        marca: g.marca,
        canal: g.canal,
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

import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllPedidosEcom,
  esContableEcomResumen,
  esCanceladaPorClienteEcom,
  esCanceladaSinStockEcom,
  num,
  canalDeOoll,
} from "@/lib/ecomHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const marca = request.nextUrl.searchParams.get("marca");
  if (!marca) {
    return NextResponse.json({ success: false, error: 'Falta el parámetro "marca".' }, { status: 400 });
  }
  // Mismo filtro "Demanda Total" que Resumen: ?incluirTodos=1.
  const incluirTodos = request.nextUrl.searchParams.get("incluirTodos") === "1";
  // Mismo rango/semana que Resumen: ?desde=YYYY-MM-DD (y opcionalmente ?hasta=YYYY-MM-DD).
  const desde = request.nextUrl.searchParams.get("desde");
  const hasta = request.nextUrl.searchParams.get("hasta");

  try {
    const rows = await fetchAllPedidosEcom();
    const marcaTrim = marca.trim();

    const esDeLaMarca = (r: { seller: string | null }) => ((r.seller || "").trim() || "SIN SELLER") === marcaTrim;
    const enRango = (r: { fecha_creacion: string | null }) => {
      if (!r.fecha_creacion) return false;
      const fecha = r.fecha_creacion.slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    };

    let contables = rows.filter((r) => esContableEcomResumen(r, incluirTodos) && esDeLaMarca(r));
    if (desde || hasta) {
      contables = contables.filter(enRango);
    }

    const porCanal = new Map<
      string,
      {
        uni: number;
        pick: number;
        sep: number;
        pedidos: Set<string>;
        canceladasPorClientes: number;
        canceladasSinStock: number;
      }
    >();

    for (const r of contables) {
      const canal = canalDeOoll(r.ooll_asignado);
      if (!porCanal.has(canal)) {
        porCanal.set(canal, { uni: 0, pick: 0, sep: 0, pedidos: new Set(), canceladasPorClientes: 0, canceladasSinStock: 0 });
      }
      const acc = porCanal.get(canal)!;
      acc.uni += num(r.uni);
      acc.pick += num(r.uni_pick);
      acc.sep += num(r.uni_sep);
      acc.pedidos.add(r.pedido);
      if (esCanceladaPorClienteEcom(r)) acc.canceladasPorClientes += num(r.uni);
      if (esCanceladaSinStockEcom(r)) acc.canceladasSinStock += num(r.uni) - num(r.uni_sep);
    }

    const canales = Array.from(porCanal.entries())
      .map(([name, acc]) => ({
        name,
        uni: acc.uni,
        pick: acc.pick,
        sep: acc.sep,
        pendPick: Math.max(0, acc.uni - acc.canceladasPorClientes - acc.pick),
        pendSep: Math.max(0, acc.uni - acc.canceladasPorClientes - acc.canceladasSinStock - acc.sep),
        unidadesCanceladasPorClientes: acc.canceladasPorClientes,
        unidadesCanceladasSinStock: acc.canceladasSinStock,
        cantidadPedidos: acc.pedidos.size,
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

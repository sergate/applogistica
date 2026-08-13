import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllPedidosEcom,
  esContableEcomResumen,
  esCanceladaPorClienteEcom,
  esCanceladaSinStockEcom,
  pickEfectivoResumenEcom,
  sepEfectivoResumenEcom,
  num,
  ultimaActualizacionEcom,
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

  // Filtro opcional por fecha: ?desde=YYYY-MM-DD (incluye esa fecha en adelante)
  // y opcionalmente ?hasta=YYYY-MM-DD (para acotar a una semana puntual).
  const desde = request.nextUrl.searchParams.get("desde");
  const hasta = request.nextUrl.searchParams.get("hasta");
  // "Demanda Total": ?incluirTodos=1 no excluye ningún estado (ni siquiera
  // OD_DESPACHADO/OD_CARGA_CAMION).
  const incluirTodos = request.nextUrl.searchParams.get("incluirTodos") === "1";

  const enRango = (r: { fecha_creacion: string | null }) => {
    if (!r.fecha_creacion) return false;
    const fecha = r.fecha_creacion.slice(0, 10);
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    return true;
  };

  try {
    const rows = await fetchAllPedidosEcom();

    // Fechas únicas de TODA la tabla (sin filtrar), para que el frontend
    // arme el selector de "Semana del año" sin depender de otras pestañas.
    const fechasDisponibles = Array.from(
      new Set(rows.map((r) => (r.fecha_creacion ? r.fecha_creacion.slice(0, 10) : "SIN FECHA")))
    );

    let contables = rows.filter((r) => esContableEcomResumen(r, incluirTodos));
    if (desde || hasta) {
      contables = contables.filter(enRango);
    }

    // Ambas tarjetas de cancelados se calculan sobre "contables" -- respetan
    // "Demanda Total" igual que el resto: OD_CARGA_CAMION (base de "sin
    // stock") queda afuera de "contables" en "No", así que esa tarjeta da 0
    // ahí y solo muestra datos con "Demanda Total: Sí".
    const unidadesCanceladasPorClientes = contables
      .filter(esCanceladaPorClienteEcom)
      .reduce((acc, r) => acc + num(r.uni), 0);
    const unidadesCanceladasSinStock = contables
      .filter(esCanceladaSinStockEcom)
      .reduce((acc, r) => acc + (num(r.uni) - num(r.uni_sep)), 0);

    // Pickeadas/Separadas: suma cruda de Uni.Pick/Uni.Sep, excepto las
    // filas OD_CANCELADA (ya están 100% contadas en "Unidades Canceladas
    // por Clientes" -- sumarlas de nuevo acá las duplicaría).
    const totalUni = contables.reduce((acc, r) => acc + num(r.uni), 0);
    const totalPick = contables.reduce((acc, r) => acc + pickEfectivoResumenEcom(r), 0);
    const totalSep = contables.reduce((acc, r) => acc + sepEfectivoResumenEcom(r), 0);
    const cantidadPedidos = new Set(contables.map((r) => r.pedido)).size;

    // Verificación: Total = Pickeadas + PendPick + CanceladasPorClientes, y
    // Total = Separadas + PendSep + CanceladasPorClientes + CanceladasSinStock.
    // Pendiente Picking solo resta lo cancelado por el cliente; Pendiente
    // Separación además resta "sin stock" (que se define por pendiente de
    // separación). Nunca puede dar negativo.
    const kpis = {
      totalUni,
      totalPick,
      totalSep,
      pendPick: Math.max(0, totalUni - unidadesCanceladasPorClientes - totalPick),
      pendSep: Math.max(0, totalUni - unidadesCanceladasPorClientes - unidadesCanceladasSinStock - totalSep),
      unidadesCanceladasPorClientes,
      unidadesCanceladasSinStock,
      cantidadPedidos,
    };

    // Agrupado por marca (= columna "seller"), todo sobre "contables".
    const porMarca = new Map<
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
      const marca = (r.seller || "").trim() || "SIN SELLER";
      if (!porMarca.has(marca)) {
        porMarca.set(marca, { uni: 0, pick: 0, sep: 0, pedidos: new Set(), canceladasPorClientes: 0, canceladasSinStock: 0 });
      }
      const acc = porMarca.get(marca)!;
      acc.uni += num(r.uni);
      acc.pick += pickEfectivoResumenEcom(r);
      acc.sep += sepEfectivoResumenEcom(r);
      acc.pedidos.add(r.pedido);
      if (esCanceladaPorClienteEcom(r)) acc.canceladasPorClientes += num(r.uni);
      if (esCanceladaSinStockEcom(r)) acc.canceladasSinStock += num(r.uni) - num(r.uni_sep);
    }

    const marcas = Array.from(porMarca.entries())
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

    return NextResponse.json({ success: true, kpis, marcas, fechasDisponibles, updatedAt: ultimaActualizacionEcom(rows) });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllPedidosEcom,
  esContableEcomResumen,
  esFilaCanceladaEcom,
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

    // "Unidades canceladas" (amplio: OD_CANCELADA/OD_RECIBIDO_DEV/Cancelado)
    // y las 2 tarjetas nuevas se calculan sobre TODAS las filas del rango de
    // fecha, sin el filtro de "Demanda Total" -- si usáramos "contables",
    // "Unidades Canceladas sin stock" siempre daría 0 en "No" (esos estados
    // quedan excluidos de "contables" ahí).
    const filasFecha = desde || hasta ? rows.filter(enRango) : rows;
    const unidadesCanceladas = filasFecha.filter(esFilaCanceladaEcom).reduce((acc, r) => acc + num(r.uni), 0);
    const unidadesCanceladasPorClientes = filasFecha
      .filter(esCanceladaPorClienteEcom)
      .reduce((acc, r) => acc + num(r.uni), 0);
    const unidadesCanceladasSinStock = filasFecha
      .filter(esCanceladaSinStockEcom)
      .reduce((acc, r) => acc + num(r.uni_sep), 0);

    let contables = rows.filter((r) => esContableEcomResumen(r, incluirTodos));
    if (desde || hasta) {
      contables = contables.filter(enRango);
    }

    // Las filas canceladas/devueltas siguen sumando a "Total Unidades", pero
    // sus unidades pickeadas/separadas no cuentan para el resto de los
    // cálculos (KPIs, tabla por marca) -- solo para el total de unidades.
    const totalUni = contables.reduce((acc, r) => acc + num(r.uni), 0);
    const totalPick = contables.reduce((acc, r) => acc + pickEfectivoResumenEcom(r), 0);
    const totalSep = contables.reduce((acc, r) => acc + sepEfectivoResumenEcom(r), 0);
    const cantidadPedidos = new Set(contables.map((r) => r.pedido)).size;

    // Pendiente = total - canceladas - lo ya hecho (las canceladas ya están
    // "resueltas", no pueden quedar pendientes de picking/separación).
    const kpis = {
      totalUni,
      totalPick,
      totalSep,
      pendPick: totalUni - unidadesCanceladas - totalPick,
      pendSep: totalUni - unidadesCanceladas - totalSep,
      unidadesCanceladasPorClientes,
      unidadesCanceladasSinStock,
      cantidadPedidos,
    };

    // Agrupado por marca (= columna "seller") -- uni/pick/sep/pedidos sobre
    // "contables" (respeta "Demanda Total"); las 3 métricas de cancelados
    // (para el Pendiente y las 2 tarjetas nuevas) sobre "filasFecha".
    const porMarca = new Map<
      string,
      { uni: number; pick: number; sep: number; pedidos: Set<string> }
    >();
    const porMarcaCancelados = new Map<
      string,
      { unidadesCanceladas: number; canceladasPorClientes: number; canceladasSinStock: number }
    >();

    for (const r of contables) {
      const marca = (r.seller || "").trim() || "SIN SELLER";
      if (!porMarca.has(marca)) {
        porMarca.set(marca, { uni: 0, pick: 0, sep: 0, pedidos: new Set() });
      }
      const acc = porMarca.get(marca)!;
      acc.uni += num(r.uni);
      acc.pick += pickEfectivoResumenEcom(r);
      acc.sep += sepEfectivoResumenEcom(r);
      acc.pedidos.add(r.pedido);
    }

    for (const r of filasFecha) {
      const marca = (r.seller || "").trim() || "SIN SELLER";
      if (!porMarcaCancelados.has(marca)) {
        porMarcaCancelados.set(marca, { unidadesCanceladas: 0, canceladasPorClientes: 0, canceladasSinStock: 0 });
      }
      const acc = porMarcaCancelados.get(marca)!;
      if (esFilaCanceladaEcom(r)) acc.unidadesCanceladas += num(r.uni);
      if (esCanceladaPorClienteEcom(r)) acc.canceladasPorClientes += num(r.uni);
      if (esCanceladaSinStockEcom(r)) acc.canceladasSinStock += num(r.uni_sep);
    }

    const marcas = Array.from(porMarca.entries())
      .map(([name, acc]) => {
        const cancelados = porMarcaCancelados.get(name) ?? {
          unidadesCanceladas: 0,
          canceladasPorClientes: 0,
          canceladasSinStock: 0,
        };
        return {
          name,
          uni: acc.uni,
          pick: acc.pick,
          sep: acc.sep,
          pendPick: acc.uni - cancelados.unidadesCanceladas - acc.pick,
          pendSep: acc.uni - cancelados.unidadesCanceladas - acc.sep,
          unidadesCanceladasPorClientes: cancelados.canceladasPorClientes,
          unidadesCanceladasSinStock: cancelados.canceladasSinStock,
          cantidadPedidos: acc.pedidos.size,
        };
      })
      .sort((a, b) => b.uni - a.uni);

    return NextResponse.json({ success: true, kpis, marcas, fechasDisponibles, updatedAt: ultimaActualizacionEcom(rows) });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

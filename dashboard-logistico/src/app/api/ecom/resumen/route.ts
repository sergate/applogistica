import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllPedidosEcom,
  esContableEcomResumen,
  esFilaCanceladaEcom,
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

  // Filtro opcional por fecha: ?desde=YYYY-MM-DD (incluye esa fecha en adelante).
  const desde = request.nextUrl.searchParams.get("desde");
  // "Demanda Total": ?incluirTodos=1 no excluye ningún estado (ni siquiera
  // OD_DESPACHADO/OD_CARGA_CAMION).
  const incluirTodos = request.nextUrl.searchParams.get("incluirTodos") === "1";

  try {
    const rows = await fetchAllPedidosEcom();

    // "Unidades Canceladas" se calcula siempre sobre el mismo conjunto de
    // filas (todas, solo acotadas por el rango de fecha) -- "Demanda Total"
    // únicamente decide si OD_DESPACHADO/OD_CARGA_CAMION entran en el resto
    // de los KPIs, no cambia qué cuenta como cancelado.
    let filasParaCancelados = rows;
    if (desde) {
      filasParaCancelados = filasParaCancelados.filter((r) =>
        r.fecha_creacion ? r.fecha_creacion.slice(0, 10) >= desde : false
      );
    }
    const unidadesCanceladas = filasParaCancelados.filter(esFilaCanceladaEcom).reduce((acc, r) => acc + num(r.uni), 0);

    let contables = rows.filter((r) => esContableEcomResumen(r, incluirTodos));
    if (desde) {
      contables = contables.filter((r) => (r.fecha_creacion ? r.fecha_creacion.slice(0, 10) >= desde : false));
    }

    // Las filas canceladas/devueltas siguen sumando a "Total Unidades", pero
    // sus unidades pickeadas/separadas no cuentan para el resto de los
    // cálculos (KPIs, tabla por marca) -- solo para el total de unidades.
    const totalUni = contables.reduce((acc, r) => acc + num(r.uni), 0);
    const totalPick = contables.reduce((acc, r) => acc + pickEfectivoResumenEcom(r), 0);
    const totalSep = contables.reduce((acc, r) => acc + sepEfectivoResumenEcom(r), 0);

    const kpis = {
      totalUni,
      totalPick,
      totalSep,
      pendPick: totalUni - totalPick,
      pendSep: totalUni - totalSep,
      eficPick: totalUni > 0 ? (totalPick / totalUni) * 100 : 0,
      eficSep: totalUni > 0 ? (totalSep / totalUni) * 100 : 0,
      unidadesCanceladas,
    };

    // Agrupado por marca (= columna "seller")
    const porMarca = new Map<
      string,
      { uni: number; pick: number; sep: number; unidadesCanceladas: number }
    >();

    for (const r of contables) {
      const marca = (r.seller || "").trim() || "SIN SELLER";
      if (!porMarca.has(marca)) {
        porMarca.set(marca, { uni: 0, pick: 0, sep: 0, unidadesCanceladas: 0 });
      }
      const acc = porMarca.get(marca)!;
      acc.uni += num(r.uni);
      acc.pick += pickEfectivoResumenEcom(r);
      acc.sep += sepEfectivoResumenEcom(r);
      if (esFilaCanceladaEcom(r)) acc.unidadesCanceladas += num(r.uni);
    }

    const marcas = Array.from(porMarca.entries())
      .map(([name, acc]) => ({
        name,
        uni: acc.uni,
        pick: acc.pick,
        sep: acc.sep,
        pendPick: acc.uni - acc.pick,
        pendSep: acc.uni - acc.sep,
        eficPick: acc.uni > 0 ? (acc.pick / acc.uni) * 100 : 0,
        eficSep: acc.uni > 0 ? (acc.sep / acc.uni) * 100 : 0,
        unidadesCanceladas: acc.unidadesCanceladas,
      }))
      .sort((a, b) => b.uni - a.uni);

    return NextResponse.json({ success: true, kpis, marcas, updatedAt: ultimaActualizacionEcom(rows) });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

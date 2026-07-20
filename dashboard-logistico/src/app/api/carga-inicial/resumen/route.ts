import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllGrupoPedidos, esContable, num, ultimaActualizacion } from "@/lib/resumenHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // nunca cachear: siempre consultar Supabase de nuevo
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      {
        success: false,
        error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  // Filtro opcional por fecha: ?desde=YYYY-MM-DD y/o ?hasta=YYYY-MM-DD (ambos inclusive).
  // Sin estos parámetros, se muestran todos los datos sin filtrar.
  const desde = request.nextUrl.searchParams.get("desde");
  const hasta = request.nextUrl.searchParams.get("hasta");

  try {
    const rows = await fetchAllGrupoPedidos();
    let contables = rows.filter(esContable);
    if (desde) {
      contables = contables.filter((r) => (r.fecha_creacion ? r.fecha_creacion.slice(0, 10) >= desde : false));
    }
    if (hasta) {
      contables = contables.filter((r) => (r.fecha_creacion ? r.fecha_creacion.slice(0, 10) <= hasta : false));
    }

    const totalUni = contables.reduce((acc, r) => acc + num(r.uni), 0);
    const totalPick = contables.reduce((acc, r) => acc + num(r.uni_pick), 0);
    const totalSep = contables.reduce((acc, r) => acc + num(r.uni_sep), 0);
    const totalRegistros = new Set(contables.map((r) => r.pedido)).size;

    const kpis = {
      totalUni,
      totalPick,
      totalSep,
      pendPick: totalUni - totalPick,
      pendSep: totalUni - totalSep,
      eficPick: totalUni > 0 ? (totalPick / totalUni) * 100 : 0,
      eficSep: totalUni > 0 ? (totalSep / totalUni) * 100 : 0,
      totalRegistros,
    };

    // Agrupado por marca (= columna "seller")
    const porMarca = new Map<
      string,
      { uni: number; pick: number; sep: number; pedidos: Set<string> }
    >();

    for (const r of contables) {
      const marca = (r.seller || "").trim() || "SIN SELLER";
      if (!porMarca.has(marca)) {
        porMarca.set(marca, { uni: 0, pick: 0, sep: 0, pedidos: new Set() });
      }
      const acc = porMarca.get(marca)!;
      acc.uni += num(r.uni);
      acc.pick += num(r.uni_pick);
      acc.sep += num(r.uni_sep);
      acc.pedidos.add(r.pedido);
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
        reg: acc.pedidos.size,
      }))
      .sort((a, b) => b.uni - a.uni);

    return NextResponse.json({ success: true, kpis, marcas, updatedAt: ultimaActualizacion(rows) });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error inesperado en el servidor",
      },
      { status: 500 }
    );
  }
}

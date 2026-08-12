import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllPedidosEcom,
  esContableEcomResumen,
  esFilaCanceladaEcom,
  pickEfectivoResumenEcom,
  sepEfectivoResumenEcom,
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

  try {
    const rows = await fetchAllPedidosEcom();
    const marcaTrim = marca.trim();
    const contables = rows.filter(
      (r) => esContableEcomResumen(r, incluirTodos) && ((r.seller || "").trim() || "SIN SELLER") === marcaTrim
    );

    const porCanal = new Map<
      string,
      { uni: number; pick: number; sep: number; unidadesCanceladas: number }
    >();

    for (const r of contables) {
      const canal = canalDeOoll(r.ooll_asignado);
      if (!porCanal.has(canal)) {
        porCanal.set(canal, { uni: 0, pick: 0, sep: 0, unidadesCanceladas: 0 });
      }
      const acc = porCanal.get(canal)!;
      acc.uni += num(r.uni);
      acc.pick += pickEfectivoResumenEcom(r);
      acc.sep += sepEfectivoResumenEcom(r);
      if (esFilaCanceladaEcom(r)) acc.unidadesCanceladas += num(r.uni);
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
        unidadesCanceladas: acc.unidadesCanceladas,
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

import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllPedidosEcom, esContableEcom, num, canalDeOoll } from "@/lib/ecomHelpers";

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

  try {
    const rows = await fetchAllPedidosEcom();
    const marcaTrim = marca.trim();
    const contables = rows.filter(
      (r) => esContableEcom(r) && ((r.seller || "").trim() || "SIN SELLER") === marcaTrim
    );

    const porCanal = new Map<
      string,
      { uni: number; pick: number; sep: number; pedidos: Set<string> }
    >();

    for (const r of contables) {
      const canal = canalDeOoll(r.ooll_asignado);
      if (!porCanal.has(canal)) {
        porCanal.set(canal, { uni: 0, pick: 0, sep: 0, pedidos: new Set() });
      }
      const acc = porCanal.get(canal)!;
      acc.uni += num(r.uni);
      acc.pick += num(r.uni_pick);
      acc.sep += num(r.uni_sep);
      acc.pedidos.add(r.pedido);
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

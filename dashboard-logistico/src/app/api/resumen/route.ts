import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // nunca cachear: siempre consultar Supabase de nuevo
export const revalidate = 0;

// Grupos que NO cuentan para los cálculos de Status de Preparación
// (son materiales de vidriera/empaque/packaging/promoción, no unidades de venta)
const GRUPOS_EXCLUIDOS = ["VIDRIERA", "MATERIALES EMPAQUE", "PACKAGING", "PROMOCION"];

// Pedidos con este estado tampoco cuentan para los cálculos (ya están cerrados)
const ESTADOS_EXCLUIDOS = ["OD_TERMINADO"];

interface GrupoPedidoRow {
  pedido: string;
  grupo: string | null;
  seller: string | null;
  estado_pedido: string | null;
  uni: number | null;
  uni_pick: number | null;
  uni_sep: number | null;
}

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas.
async function fetchAllGrupoPedidos(): Promise<GrupoPedidoRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: GrupoPedidoRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("grupo_pedidos")
      .select("pedido, grupo, seller, estado_pedido, uni, uni_pick, uni_sep")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase (grupo_pedidos): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    all.push(...(data as GrupoPedidoRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

function esGrupoContable(grupo: string | null): boolean {
  if (!grupo) return true;
  return !GRUPOS_EXCLUIDOS.includes(grupo.trim().toUpperCase());
}

function esEstadoContable(estado: string | null): boolean {
  if (!estado) return true;
  return !ESTADOS_EXCLUIDOS.includes(estado.trim().toUpperCase());
}

const num = (v: number | null): number => Number(v) || 0;

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      {
        success: false,
        error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  try {
    const rows = await fetchAllGrupoPedidos();
    const contables = rows.filter(
      (r) => esGrupoContable(r.grupo) && esEstadoContable(r.estado_pedido)
    );

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

    return NextResponse.json({ success: true, kpis, marcas });
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

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { num } from "@/lib/resumenHelpers";

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

  const pedido = request.nextUrl.searchParams.get("pedido");
  if (!pedido) {
    return NextResponse.json({ success: false, error: 'Falta el parámetro "pedido".' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("grupo_pedidos")
      .select("grupo, nombre_pedido, uni, uni_pick, uni_sep")
      .eq("pedido", pedido);

    if (error) {
      throw new Error(`Supabase (grupo_pedidos): ${error.message}`);
    }

    const grupos = (data ?? []).map((g) => {
      const uni = num(g.uni as number | null);
      const pick = num(g.uni_pick as number | null);
      const sep = num(g.uni_sep as number | null);
      return {
        grupo: (g.grupo as string | null) || "SIN GRUPO",
        nombrePedido: (g.nombre_pedido as string | null) || "",
        uni,
        pick,
        sep,
        pendPick: uni - pick,
        pendSep: uni - sep,
        eficPick: uni > 0 ? (pick / uni) * 100 : 0,
        eficSep: uni > 0 ? (sep / uni) * 100 : 0,
      };
    });

    return NextResponse.json({ success: true, pedido, grupos });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

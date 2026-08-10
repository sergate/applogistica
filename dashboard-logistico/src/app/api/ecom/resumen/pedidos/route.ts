import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllPedidosEcom, esContableEcom, num, ultimaActualizacionEcom, canalDeOoll } from "@/lib/ecomHelpers";

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
    const rows = await fetchAllPedidosEcom();
    const contables = rows.filter(esContableEcom);

    // Acá la granularidad ya es 1 fila = 1 pedido (no hay líneas por grupo
    // que consolidar, ni tienda/cliente que resolver -- el archivo ya trae
    // todo resuelto).
    const filas = contables.map((r) => {
      const uni = num(r.uni);
      const pick = num(r.uni_pick);
      const sep = num(r.uni_sep);
      return {
        pedido: r.pedido,
        nombrePedido: r.nombre_pedido || "",
        marca: (r.seller || "").trim() || "SIN SELLER",
        canal: canalDeOoll(r.ooll_asignado),
        sector: (r.sector || "").trim() || "SIN SECTOR",
        fecha: soloFecha(r.fecha_creacion),
        uni,
        pick,
        sep,
        pendPick: uni - pick,
        pendSep: uni - sep,
        eficPick: uni > 0 ? (pick / uni) * 100 : 0,
        eficSep: uni > 0 ? (sep / uni) * 100 : 0,
      };
    });

    return NextResponse.json({ success: true, filas, updatedAt: ultimaActualizacionEcom(rows) });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

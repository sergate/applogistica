import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agrega un cliente (por código) al grupo. Como codigo_cliente es la primary
// key de la tabla de miembros, un upsert acá "mueve" al cliente si ya
// pertenecía a otro grupo -- un cliente nunca queda en más de uno.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const codigoCliente = typeof body?.codigoCliente === "string" ? body.codigoCliente.trim() : "";
    if (!codigoCliente) {
      return NextResponse.json({ success: false, error: "Falta el número de cliente." }, { status: 400 });
    }

    const { data: cliente } = await supabaseAdmin
      .from("clientes")
      .select("codigo, nombre")
      .eq("codigo", codigoCliente)
      .maybeSingle();
    if (!cliente) {
      return NextResponse.json(
        { success: false, error: `No existe ningún cliente con el número "${codigoCliente}".` },
        { status: 404 }
      );
    }

    const { error } = await supabaseAdmin
      .from("despacho_grupos_clientes_miembros")
      .upsert({ codigo_cliente: codigoCliente, grupo_id: Number(id) }, { onConflict: "codigo_cliente" });
    if (error) throw new Error(`Supabase (despacho_grupos_clientes_miembros): ${error.message}`);

    return NextResponse.json({ success: true, miembro: { codigoCliente, nombre: cliente.nombre } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

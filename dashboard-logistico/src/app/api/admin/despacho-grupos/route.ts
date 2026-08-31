import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [{ data: grupos, error: errorGrupos }, { data: miembros, error: errorMiembros }] = await Promise.all([
      supabaseAdmin.from("despacho_grupos_clientes").select("id, nombre, created_at").order("nombre"),
      supabaseAdmin.from("despacho_grupos_clientes_miembros").select("grupo_id, codigo_cliente"),
    ]);
    if (errorGrupos) throw new Error(`Supabase (despacho_grupos_clientes): ${errorGrupos.message}`);
    if (errorMiembros) throw new Error(`Supabase (despacho_grupos_clientes_miembros): ${errorMiembros.message}`);

    const codigos = [...new Set((miembros || []).map((m) => m.codigo_cliente))];
    const { data: clientesInfo, error: errorClientes } =
      codigos.length > 0
        ? await supabaseAdmin.from("clientes").select("codigo, nombre").in("codigo", codigos)
        : { data: [], error: null };
    if (errorClientes) throw new Error(`Supabase (clientes): ${errorClientes.message}`);

    const nombrePorCodigo = new Map((clientesInfo || []).map((c) => [c.codigo, c.nombre]));

    const resultado = (grupos || []).map((g) => ({
      id: g.id,
      nombre: g.nombre,
      miembros: (miembros || [])
        .filter((m) => m.grupo_id === g.id)
        .map((m) => ({
          codigoCliente: m.codigo_cliente,
          nombre: nombrePorCodigo.get(m.codigo_cliente) || null,
        }))
        .sort((a, b) => a.codigoCliente.localeCompare(b.codigoCliente)),
    }));

    return NextResponse.json({ success: true, grupos: resultado });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("DESP-Grupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) {
      return NextResponse.json({ success: false, error: "Falta el nombre del grupo." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("despacho_grupos_clientes")
      .insert({ nombre })
      .select("id, nombre, created_at")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505" ? "Ya existe un grupo con ese nombre." : `Supabase (despacho_grupos_clientes): ${error.message}`
      );
    }

    return NextResponse.json({ success: true, grupo: { ...data, miembros: [] } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

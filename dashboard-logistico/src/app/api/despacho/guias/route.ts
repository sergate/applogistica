import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { parseCodigoClienteDespacho } from "@/lib/pendienteDespachoHelpers";
import { requireAuth, esErrorAuth } from "@/lib/auth";

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

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const vista = request.nextUrl.searchParams.get("vista");
    if (vista !== "imprimir" && vista !== "reimprimir") {
      return NextResponse.json({ success: false, error: 'Falta "vista" (imprimir|reimprimir).' }, { status: 400 });
    }

    const { data: config } = await supabaseAdmin
      .from("despacho_configuracion")
      .select("ocultar_tipo_cliente")
      .eq("id", 1)
      .maybeSingle();

    // Los despachos ECOM no pasan por este circuito de impresión. El
    // ocultamiento de tipo CLIENTE es configurable por el admin (panel
    // "Grupos de Clientes" -> /api/admin/despacho-configuracion).
    let query = supabaseAdmin
      .from("despacho_guias")
      .select("*")
      .neq("tipo", "ECOM")
      .order("fecha_creacion", { ascending: false });
    if (config?.ocultar_tipo_cliente) query = query.neq("tipo", "CLIENTE");
    query =
      vista === "reimprimir"
        ? query.eq("guia_impresa", true).eq("remito_impreso", true)
        : query.or("guia_impresa.eq.false,remito_impreso.eq.false");

    const { data, error } = await query;
    if (error) throw new Error(`Supabase (despacho_guias): ${error.message}`);

    // Grupos de cada guía (por número de cliente, ver /api/admin/despacho-grupos).
    // Un cliente puede estar en varios grupos a la vez (ej. entrega martes Y jueves).
    const codigos = [...new Set((data || []).map((f) => parseCodigoClienteDespacho(f.cliente)).filter(Boolean))];
    const { data: miembros, error: errorMiembros } =
      codigos.length > 0
        ? await supabaseAdmin
            .from("despacho_grupos_clientes_miembros")
            .select("codigo_cliente, despacho_grupos_clientes(nombre)")
            .in("codigo_cliente", codigos as string[])
        : { data: [], error: null };
    if (errorMiembros) throw new Error(`Supabase (despacho_grupos_clientes_miembros): ${errorMiembros.message}`);

    const gruposPorCodigo = new Map<string, string[]>();
    for (const m of miembros || []) {
      const grupo = Array.isArray(m.despacho_grupos_clientes) ? m.despacho_grupos_clientes[0] : m.despacho_grupos_clientes;
      const nombre = (grupo as { nombre: string } | null)?.nombre;
      if (!nombre) continue;
      const lista = gruposPorCodigo.get(m.codigo_cliente) || [];
      lista.push(nombre);
      gruposPorCodigo.set(m.codigo_cliente, lista);
    }

    let filas = (data || []).map((f) => ({
      ...f,
      grupos: gruposPorCodigo.get(parseCodigoClienteDespacho(f.cliente) || "") || [],
    }));

    // "Guías Impresas" (reimprimir) va por última impresión -- la más
    // reciente entre guía y remito, no por fecha de creación del despacho.
    if (vista === "reimprimir") {
      const ultimaImpresion = (f: (typeof filas)[number]) => {
        const t1 = f.guia_impresa_en ? new Date(f.guia_impresa_en).getTime() : 0;
        const t2 = f.remito_impreso_en ? new Date(f.remito_impreso_en).getTime() : 0;
        return Math.max(t1, t2);
      };
      filas = [...filas].sort((a, b) => ultimaImpresion(b) - ultimaImpresion(a));
    }

    let updatedAt: string | null = null;
    for (const fila of filas) {
      if (fila.updated_at && (!updatedAt || fila.updated_at > updatedAt)) updatedAt = fila.updated_at;
    }

    return NextResponse.json({ success: true, filas, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

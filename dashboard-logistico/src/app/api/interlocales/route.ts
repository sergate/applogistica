import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MARCAS_VALIDAS = ["CHEEKY", "COMO QUIERES", "AWADA"] as const;

// Listado de interlocales, filtrable por estado (default "pendiente"),
// local destino y fecha -- es como la futura Hoja de Ruta va a buscar qué
// hay disponible para un local en un día.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const params = request.nextUrl.searchParams;
    const estado = params.get("estado") || "pendiente";
    const localDestino = params.get("localDestino");
    const fecha = params.get("fecha");

    let query = supabaseAdmin.from("interlocales").select("*").order("fecha", { ascending: false });
    if (estado !== "todos") query = query.eq("estado", estado);
    if (localDestino) query = query.eq("local_destino_codigo", localDestino);
    if (fecha) query = query.eq("fecha", fecha);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase (interlocales): ${error.message}`);

    return NextResponse.json({ success: true, filas: data || [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

// Registra un interlocal nuevo transcribiendo el rótulo físico.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();

    const numeroMovimiento = typeof body?.numeroMovimiento === "string" ? body.numeroMovimiento.trim() : "";
    const localOrigenCodigo = typeof body?.localOrigenCodigo === "string" ? body.localOrigenCodigo.trim() : "";
    const localDestinoCodigo = typeof body?.localDestinoCodigo === "string" ? body.localDestinoCodigo.trim() : "";
    const fecha = typeof body?.fecha === "string" ? body.fecha.trim() : "";

    if (!numeroMovimiento) {
      return NextResponse.json({ success: false, error: "Falta el N° de Movimiento." }, { status: 400 });
    }
    if (!localOrigenCodigo) {
      return NextResponse.json({ success: false, error: "Falta el local de origen." }, { status: 400 });
    }
    if (!localDestinoCodigo) {
      return NextResponse.json({ success: false, error: "Falta el local de destino." }, { status: 400 });
    }
    if (!fecha) {
      return NextResponse.json({ success: false, error: "Falta la fecha." }, { status: 400 });
    }

    const marca = typeof body?.marca === "string" ? body.marca.trim().toUpperCase() : null;
    if (marca && !MARCAS_VALIDAS.includes(marca as (typeof MARCAS_VALIDAS)[number])) {
      return NextResponse.json({ success: false, error: `Marca inválida: "${marca}".` }, { status: 400 });
    }

    // Resolvemos nombre de origen/destino contra "clientes" (los locales
    // salen de esa tabla) para no depender de lo que haya tipeado el
    // usuario a mano.
    const codigos = [...new Set([localOrigenCodigo, localDestinoCodigo])];
    const { data: clientesInfo, error: errorClientes } = await supabaseAdmin
      .from("clientes")
      .select("codigo, nombre")
      .in("codigo", codigos);
    if (errorClientes) throw new Error(`Supabase (clientes): ${errorClientes.message}`);

    const nombrePorCodigo = new Map((clientesInfo || []).map((c) => [c.codigo, c.nombre]));
    if (!nombrePorCodigo.has(localOrigenCodigo)) {
      return NextResponse.json(
        { success: false, error: `No existe ningún local con el código "${localOrigenCodigo}".` },
        { status: 404 }
      );
    }
    if (!nombrePorCodigo.has(localDestinoCodigo)) {
      return NextResponse.json(
        { success: false, error: `No existe ningún local con el código "${localDestinoCodigo}".` },
        { status: 404 }
      );
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const { data, error } = await supabaseAdmin
      .from("interlocales")
      .insert({
        numero_movimiento: numeroMovimiento,
        numero_remito: typeof body?.numeroRemito === "string" ? body.numeroRemito.trim() || null : null,
        local_origen_codigo: localOrigenCodigo,
        local_origen_nombre: nombrePorCodigo.get(localOrigenCodigo) || null,
        local_destino_codigo: localDestinoCodigo,
        local_destino_nombre: nombrePorCodigo.get(localDestinoCodigo) || null,
        domicilio_entrega: typeof body?.domicilioEntrega === "string" ? body.domicilioEntrega.trim() || null : null,
        fecha,
        marca,
        temporada: typeof body?.temporada === "string" ? body.temporada.trim() || null : null,
        tipo: typeof body?.tipo === "string" ? body.tipo.trim() || null : null,
        grupo: typeof body?.grupo === "string" ? body.grupo.trim() || null : null,
        subgrupo: typeof body?.subgrupo === "string" ? body.subgrupo.trim() || null : null,
        talle: typeof body?.talle === "string" ? body.talle.trim() || null : null,
        confecciono: typeof body?.confecciono === "string" ? body.confecciono.trim() || null : null,
        encargada: typeof body?.encargada === "string" ? body.encargada.trim() || null : null,
        registrado_por_id: auth.userId,
        registrado_por_nombre: usuario?.nombre || null,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505"
          ? `Ya existe un interlocal registrado con el N° de Movimiento "${numeroMovimiento}".`
          : `Supabase (interlocales): ${error.message}`
      );
    }

    return NextResponse.json({ success: true, fila: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

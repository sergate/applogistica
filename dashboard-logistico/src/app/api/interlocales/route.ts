import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MARCAS_VALIDAS = ["CHEEKY", "COMO QUIERES", "AWADA", "ESTUDIO 5"] as const;

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

    const ids = (data || []).map((f) => f.id);
    const etiquetasPorInterlocal = new Map<number, string[]>();
    if (ids.length > 0) {
      const { data: etiquetas, error: errorEtiquetas } = await supabaseAdmin
        .from("interlocales_bultos_etiquetas")
        .select("interlocal_id, codigo, orden")
        .in("interlocal_id", ids)
        .order("orden", { ascending: true });
      if (errorEtiquetas) throw new Error(`Supabase (interlocales_bultos_etiquetas): ${errorEtiquetas.message}`);
      for (const e of etiquetas || []) {
        if (!etiquetasPorInterlocal.has(e.interlocal_id)) etiquetasPorInterlocal.set(e.interlocal_id, []);
        etiquetasPorInterlocal.get(e.interlocal_id)!.push(e.codigo);
      }
    }

    const filas = (data || []).map((f) => ({ ...f, etiquetas: etiquetasPorInterlocal.get(f.id) || [] }));

    return NextResponse.json({ success: true, filas });
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

    // "Varios" no pide N° de Movimiento -- usa el mismo número que el N° de
    // Remito (ambos se asignan más abajo, de forma atómica).
    const tipoEnvio = body?.tipoEnvio === "varios" ? "varios" : "productos";
    let numeroMovimiento = typeof body?.numeroMovimiento === "string" ? body.numeroMovimiento.trim() : "";
    const localOrigenCodigo = typeof body?.localOrigenCodigo === "string" ? body.localOrigenCodigo.trim() : "";
    const localDestinoCodigo = typeof body?.localDestinoCodigo === "string" ? body.localDestinoCodigo.trim() : "";
    const fecha = typeof body?.fecha === "string" ? body.fecha.trim() : "";

    if (!numeroMovimiento && tipoEnvio !== "varios") {
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

    const cantidadBultos = Number(body?.cantidadBultos);
    if (body?.cantidadBultos !== undefined && (!Number.isInteger(cantidadBultos) || cantidadBultos < 1)) {
      return NextResponse.json({ success: false, error: "La cantidad de bultos tiene que ser un entero mayor a 0." }, { status: 400 });
    }
    const cantidadBultosFinal = Number.isInteger(cantidadBultos) && cantidadBultos >= 1 ? cantidadBultos : 1;

    // "etiquetas": una por bulto (form nuevo, cantidad_bultos > 1). Si no
    // viene, caemos al campo viejo "numeroEtiqueta" (un solo valor) para no
    // romper nada que todavía lo mande así.
    const etiquetasCrudas = Array.isArray(body?.etiquetas)
      ? (body.etiquetas as unknown[]).filter((e): e is string => typeof e === "string")
      : typeof body?.numeroEtiqueta === "string" && body.numeroEtiqueta.trim()
        ? [body.numeroEtiqueta]
        : [];
    const etiquetas = [...new Set(etiquetasCrudas.map((e) => e.trim()).filter(Boolean))];
    // Obligatorio cargar el N° de Etiqueta de cada bulto -- ni de más
    // (no se puede identificar un bulto que no existe) ni de menos (si no,
    // el control de bultos por handheld no puede verificar ese bulto).
    if (etiquetas.length !== cantidadBultosFinal) {
      return NextResponse.json(
        {
          success: false,
          error: `Hace falta cargar el N° de Etiqueta de los ${cantidadBultosFinal} bulto(s) (van ${etiquetas.length}).`,
        },
        { status: 400 }
      );
    }
    const numeroEtiqueta = etiquetas[0] || null;

    // "Varios" no se carga a mano -- el número lo asigna la función de
    // Postgres de forma atómica (evita que dos altas simultáneas se lleven
    // el mismo número), y se usa igual para N° de Remito y N° de Movimiento.
    let numeroRemito: string | null;
    if (tipoEnvio === "varios") {
      const { data: numeroGenerado, error: errorNumero } = await supabaseAdmin.rpc("siguiente_numero_varios_interlocal");
      if (errorNumero) throw new Error(`Supabase (siguiente_numero_varios_interlocal): ${errorNumero.message}`);
      numeroRemito = String(numeroGenerado);
      numeroMovimiento = numeroRemito;
    } else {
      numeroRemito = typeof body?.numeroRemito === "string" ? body.numeroRemito.trim() || null : null;
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const { data, error } = await supabaseAdmin
      .from("interlocales")
      .insert({
        numero_movimiento: numeroMovimiento,
        numero_remito: numeroRemito,
        numero_etiqueta: numeroEtiqueta,
        tipo_envio: tipoEnvio,
        local_origen_codigo: localOrigenCodigo,
        local_origen_nombre: nombrePorCodigo.get(localOrigenCodigo) || null,
        local_destino_codigo: localDestinoCodigo,
        local_destino_nombre: nombrePorCodigo.get(localDestinoCodigo) || null,
        fecha,
        marca,
        cantidad_bultos: cantidadBultosFinal,
        observaciones: typeof body?.observaciones === "string" ? body.observaciones.trim() || null : null,
        registrado_por_id: auth.userId,
        registrado_por_nombre: usuario?.nombre || null,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505"
          ? error.message.includes("numero_etiqueta")
            ? `Ya existe un interlocal registrado con el N° Etiqueta "${numeroEtiqueta}".`
            : `Ya existe un interlocal registrado con el N° de Movimiento "${numeroMovimiento}".`
          : `Supabase (interlocales): ${error.message}`
      );
    }

    if (etiquetas.length > 0) {
      const { error: errorEtiquetas } = await supabaseAdmin
        .from("interlocales_bultos_etiquetas")
        .insert(etiquetas.map((codigo, i) => ({ interlocal_id: data.id, codigo, orden: i + 1 })));
      if (errorEtiquetas) {
        // No dejamos el interlocal a medio registrar si alguna etiqueta no
        // se pudo guardar (ej. ya estaba usada en otro bulto) -- se borra y
        // se informa el error real.
        await supabaseAdmin.from("interlocales").delete().eq("id", data.id);
        throw new Error(
          errorEtiquetas.code === "23505"
            ? "Ya existe un bulto registrado con alguna de esas etiquetas."
            : `Supabase (interlocales_bultos_etiquetas): ${errorEtiquetas.message}`
        );
      }
    }

    return NextResponse.json({ success: true, fila: { ...data, etiquetas } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

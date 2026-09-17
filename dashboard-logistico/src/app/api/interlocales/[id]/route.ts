import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARCAS_VALIDAS = ["CHEEKY", "COMO QUIERES", "AWADA", "ESTUDIO 5"] as const;

// Modifica un interlocal ya registrado (corregir un dato mal transcripto del
// rótulo). Solo mientras esté "pendiente" -- una vez que entró a una Hoja de
// Ruta o se despachó, ya no se puede tocar.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const interlocalId = Number(id);
    if (!Number.isFinite(interlocalId)) {
      return NextResponse.json({ success: false, error: "ID de interlocal inválido." }, { status: 400 });
    }

    const { data: actual } = await supabaseAdmin
      .from("interlocales")
      .select("estado, tipo_envio, numero_remito")
      .eq("id", interlocalId)
      .maybeSingle();
    if (!actual) return NextResponse.json({ success: false, error: "No existe ese interlocal." }, { status: 404 });
    if (actual.estado !== "pendiente") {
      return NextResponse.json(
        { success: false, error: "Solo se puede modificar un interlocal mientras esté pendiente." },
        { status: 400 }
      );
    }

    const body = await request.json();

    // "Varios" no pide N° de Movimiento -- usa el mismo número que el N° de
    // Remito.
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

    // Igual criterio que en el alta: "varios" nunca se edita a mano. Si
    // recién ahora pasa a ser "varios" se le asigna un número nuevo (y se
    // usa también para N° de Movimiento); si ya era "varios" se mantiene el
    // que tenía (no se regenera en cada edición).
    let numeroRemito: string | null;
    if (tipoEnvio === "varios") {
      if (actual.tipo_envio === "varios") {
        numeroRemito = actual.numero_remito;
      } else {
        const { data: numeroGenerado, error: errorNumero } = await supabaseAdmin.rpc("siguiente_numero_varios_interlocal");
        if (errorNumero) throw new Error(`Supabase (siguiente_numero_varios_interlocal): ${errorNumero.message}`);
        numeroRemito = String(numeroGenerado);
      }
      numeroMovimiento = numeroRemito;
    } else {
      numeroRemito = typeof body?.numeroRemito === "string" ? body.numeroRemito.trim() || null : null;
    }

    const { data, error } = await supabaseAdmin
      .from("interlocales")
      .update({
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
      })
      .eq("id", interlocalId)
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

    // Reemplazo total de las etiquetas por bulto (se borran las que tenía y
    // se cargan las que mandó el form) -- más simple que diffear, y este
    // endpoint solo se usa mientras el interlocal está "pendiente" (poco
    // volumen de filas por vez).
    const { error: errorBorrarEtiquetas } = await supabaseAdmin
      .from("interlocales_bultos_etiquetas")
      .delete()
      .eq("interlocal_id", interlocalId);
    if (errorBorrarEtiquetas) {
      throw new Error(`Supabase (interlocales_bultos_etiquetas - borrado): ${errorBorrarEtiquetas.message}`);
    }
    if (etiquetas.length > 0) {
      const { error: errorEtiquetas } = await supabaseAdmin
        .from("interlocales_bultos_etiquetas")
        .insert(etiquetas.map((codigo, i) => ({ interlocal_id: interlocalId, codigo, orden: i + 1 })));
      if (errorEtiquetas) {
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

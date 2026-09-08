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

    const { data: actual } = await supabaseAdmin.from("interlocales").select("estado").eq("id", interlocalId).maybeSingle();
    if (!actual) return NextResponse.json({ success: false, error: "No existe ese interlocal." }, { status: 404 });
    if (actual.estado !== "pendiente") {
      return NextResponse.json(
        { success: false, error: "Solo se puede modificar un interlocal mientras esté pendiente." },
        { status: 400 }
      );
    }

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

    const numeroEtiqueta = typeof body?.numeroEtiqueta === "string" ? body.numeroEtiqueta.trim() || null : null;

    const { data, error } = await supabaseAdmin
      .from("interlocales")
      .update({
        numero_movimiento: numeroMovimiento,
        numero_remito: typeof body?.numeroRemito === "string" ? body.numeroRemito.trim() || null : null,
        numero_etiqueta: numeroEtiqueta,
        local_origen_codigo: localOrigenCodigo,
        local_origen_nombre: nombrePorCodigo.get(localOrigenCodigo) || null,
        local_destino_codigo: localDestinoCodigo,
        local_destino_nombre: nombrePorCodigo.get(localDestinoCodigo) || null,
        fecha,
        marca,
        cantidad_bultos: Number.isInteger(cantidadBultos) && cantidadBultos >= 1 ? cantidadBultos : 1,
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

    return NextResponse.json({ success: true, fila: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

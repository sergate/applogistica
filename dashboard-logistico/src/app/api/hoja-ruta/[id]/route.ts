import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Detalle completo de una Hoja de Ruta -- cabecera + ítems, cada uno con los
// datos de origen resueltos (interlocal o guía de despacho). Es lo que
// alimenta la vista imprimible.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const hojaId = Number(id);
    if (!Number.isFinite(hojaId)) {
      return NextResponse.json({ success: false, error: "ID de hoja de ruta inválido." }, { status: 400 });
    }

    const { data: hoja, error: errorHoja } = await supabaseAdmin
      .from("hojas_de_ruta")
      .select("*")
      .eq("id", hojaId)
      .maybeSingle();
    if (errorHoja) throw new Error(`Supabase (hojas_de_ruta): ${errorHoja.message}`);
    if (!hoja) return NextResponse.json({ success: false, error: "No existe esa hoja de ruta." }, { status: 404 });

    const { data: items, error: errorItems } = await supabaseAdmin
      .from("hoja_de_ruta_items")
      .select("*")
      .eq("hoja_de_ruta_id", hojaId)
      .order("orden");
    if (errorItems) throw new Error(`Supabase (hoja_de_ruta_items): ${errorItems.message}`);

    const interlocalIds = (items || []).filter((i) => i.tipo === "interlocal").map((i) => i.referencia_id);
    const despachoIds = (items || []).filter((i) => i.tipo === "despacho").map((i) => i.referencia_id);

    const [{ data: interlocales, error: errInter }, { data: despachos, error: errDesp }] = await Promise.all([
      interlocalIds.length > 0
        ? supabaseAdmin.from("interlocales").select("*").in("id", interlocalIds)
        : Promise.resolve({ data: [], error: null }),
      despachoIds.length > 0
        ? supabaseAdmin.from("despacho_guias").select("*").in("despacho_cab_id", despachoIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (errInter) throw new Error(`Supabase (interlocales): ${errInter.message}`);
    if (errDesp) throw new Error(`Supabase (despacho_guias): ${errDesp.message}`);

    const interlocalPorId = new Map((interlocales || []).map((i) => [i.id, i]));
    const despachoPorId = new Map((despachos || []).map((d) => [d.despacho_cab_id, d]));

    const itemsResueltos = (items || []).map((it) => ({
      ...it,
      detalle: it.tipo === "interlocal" ? interlocalPorId.get(it.referencia_id) || null : despachoPorId.get(it.referencia_id) || null,
    }));

    return NextResponse.json({ success: true, hoja, items: itemsResueltos });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

interface ItemInput {
  tipo: "interlocal" | "despacho";
  referenciaId: number;
}

// Modifica una Hoja de Ruta ya creada: cabecera (transporte/patente/chofer)
// y/o la lista de ítems. Libera lo que se saca (vuelve a estar disponible
// para otra hoja) y toma lo que se agrega, validando que no lo haya tomado
// otra hoja entremedio -- mismas reglas que al crearla.
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
    const hojaId = Number(id);
    if (!Number.isFinite(hojaId)) {
      return NextResponse.json({ success: false, error: "ID de hoja de ruta inválido." }, { status: 400 });
    }

    const body = await request.json();
    const items = Array.isArray(body?.items) ? (body.items as ItemInput[]) : [];
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "La hoja de ruta necesita al menos un ítem." }, { status: 400 });
    }
    for (const it of items) {
      if ((it.tipo !== "interlocal" && it.tipo !== "despacho") || !Number.isFinite(it.referenciaId)) {
        return NextResponse.json({ success: false, error: "Hay un ítem con datos inválidos." }, { status: 400 });
      }
    }

    const { data: hoja } = await supabaseAdmin.from("hojas_de_ruta").select("estado").eq("id", hojaId).maybeSingle();
    if (!hoja) return NextResponse.json({ success: false, error: "No existe esa hoja de ruta." }, { status: 404 });
    if (hoja.estado === "anulada") {
      return NextResponse.json({ success: false, error: "No se puede modificar una hoja de ruta anulada." }, { status: 400 });
    }

    // Si alguna guía de la hoja ya está en DP_COT_OK en el WMS (cotización
    // confirmada), no se puede tocar la hoja -- ni sacar/agregar ítems ni
    // cambiar transporte/patente/chofer -- porque ya está en curso del lado
    // del WMS.
    const { data: guiaBloqueante, error: errorGuiaBloqueante } = await supabaseAdmin
      .from("despacho_guias")
      .select("numero_guia, guia")
      .eq("hoja_de_ruta_id", hojaId)
      .eq("estado_wms", "DP_COT_OK")
      .limit(1)
      .maybeSingle();
    if (errorGuiaBloqueante) throw new Error(`Supabase (despacho_guias): ${errorGuiaBloqueante.message}`);
    if (guiaBloqueante) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede modificar: la guía ${guiaBloqueante.numero_guia || guiaBloqueante.guia} ya está en estado DP_COT_OK en el WMS.`,
        },
        { status: 400 }
      );
    }

    const { data: itemsActuales, error: errorItemsActuales } = await supabaseAdmin
      .from("hoja_de_ruta_items")
      .select("tipo, referencia_id")
      .eq("hoja_de_ruta_id", hojaId);
    if (errorItemsActuales) throw new Error(`Supabase (hoja_de_ruta_items): ${errorItemsActuales.message}`);

    const clave = (it: { tipo: string; referencia_id?: number; referenciaId?: number }) =>
      `${it.tipo}:${it.referencia_id ?? it.referenciaId}`;
    const clavesActuales = new Set((itemsActuales || []).map(clave));
    const clavesNuevas = new Set(items.map(clave));

    const aQuitar = (itemsActuales || []).filter((it) => !clavesNuevas.has(clave(it)));
    const aAgregar = items.filter((it) => !clavesActuales.has(clave(it)));

    const interlocalIdsAgregar = aAgregar.filter((i) => i.tipo === "interlocal").map((i) => i.referenciaId);
    const despachoIdsAgregar = aAgregar.filter((i) => i.tipo === "despacho").map((i) => i.referenciaId);

    // Mismas validaciones que al crear: lo que se agrega no puede estar
    // tomado por OTRA hoja (lo que ya estaba en esta hoja no se revalida).
    if (interlocalIdsAgregar.length > 0) {
      const { data: yaTomados, error: errYaTomados } = await supabaseAdmin
        .from("interlocales")
        .select("id")
        .in("id", interlocalIdsAgregar)
        .neq("estado", "pendiente");
      if (errYaTomados) throw new Error(`Supabase (interlocales): ${errYaTomados.message}`);
      if ((yaTomados || []).length > 0) {
        throw new Error("Alguno de los interlocales que agregaste ya se incluyó en otra Hoja de Ruta.");
      }
    }
    if (despachoIdsAgregar.length > 0) {
      const { data: yaTomadas, error: errYaTomadas } = await supabaseAdmin
        .from("despacho_guias")
        .select("despacho_cab_id")
        .in("despacho_cab_id", despachoIdsAgregar)
        .not("hoja_de_ruta_id", "is", null);
      if (errYaTomadas) throw new Error(`Supabase (despacho_guias): ${errYaTomadas.message}`);
      if ((yaTomadas || []).length > 0) {
        throw new Error("Alguna de las guías que agregaste ya se incluyó en otra Hoja de Ruta.");
      }
    }

    const interlocalIdsQuitar = aQuitar.filter((i) => i.tipo === "interlocal").map((i) => i.referencia_id);
    const despachoIdsQuitar = aQuitar.filter((i) => i.tipo === "despacho").map((i) => i.referencia_id);

    if (interlocalIdsQuitar.length > 0) {
      const { error } = await supabaseAdmin
        .from("interlocales")
        .update({ estado: "pendiente", hoja_de_ruta_id: null })
        .in("id", interlocalIdsQuitar);
      if (error) throw new Error(`Supabase (interlocales): ${error.message}`);
    }
    if (despachoIdsQuitar.length > 0) {
      const { error } = await supabaseAdmin
        .from("despacho_guias")
        .update({ hoja_de_ruta_id: null })
        .in("despacho_cab_id", despachoIdsQuitar);
      if (error) throw new Error(`Supabase (despacho_guias): ${error.message}`);
    }
    if (interlocalIdsAgregar.length > 0) {
      const { error } = await supabaseAdmin
        .from("interlocales")
        .update({ estado: "en_hoja_de_ruta", hoja_de_ruta_id: hojaId })
        .in("id", interlocalIdsAgregar);
      if (error) throw new Error(`Supabase (interlocales): ${error.message}`);
    }
    if (despachoIdsAgregar.length > 0) {
      const { error } = await supabaseAdmin
        .from("despacho_guias")
        .update({ hoja_de_ruta_id: hojaId })
        .in("despacho_cab_id", despachoIdsAgregar);
      if (error) throw new Error(`Supabase (despacho_guias): ${error.message}`);
    }

    // Reemplazar los ítems de la hoja por la lista nueva completa (más
    // simple que actualizar fila por fila, y el orden queda prolijo).
    const { error: errorDelete } = await supabaseAdmin.from("hoja_de_ruta_items").delete().eq("hoja_de_ruta_id", hojaId);
    if (errorDelete) throw new Error(`Supabase (hoja_de_ruta_items): ${errorDelete.message}`);
    const itemsInsert = items.map((it, idx) => ({
      hoja_de_ruta_id: hojaId,
      tipo: it.tipo,
      referencia_id: it.referenciaId,
      orden: idx,
    }));
    const { error: errorInsert } = await supabaseAdmin.from("hoja_de_ruta_items").insert(itemsInsert);
    if (errorInsert) throw new Error(`Supabase (hoja_de_ruta_items): ${errorInsert.message}`);

    const patchCabecera: Record<string, string | null> = {};
    if (typeof body?.transporte === "string") patchCabecera.transporte = body.transporte.trim() || null;
    if (typeof body?.patente === "string") patchCabecera.patente = body.patente.trim() || null;
    if (typeof body?.chofer === "string") patchCabecera.chofer = body.chofer.trim() || null;

    const { data: hojaActualizada, error: errorUpdate } = await supabaseAdmin
      .from("hojas_de_ruta")
      .update(patchCabecera)
      .eq("id", hojaId)
      .select("*")
      .single();
    if (errorUpdate) throw new Error(`Supabase (hojas_de_ruta): ${errorUpdate.message}`);

    return NextResponse.json({ success: true, hoja: hojaActualizada });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

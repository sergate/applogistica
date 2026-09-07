import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ItemInput {
  tipo: "interlocal" | "despacho";
  referenciaId: number;
}

// Listado histórico de hojas de ruta, filtrable por fecha/estado.
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
    const fecha = params.get("fecha");
    const estado = params.get("estado");

    let query = supabaseAdmin.from("hojas_de_ruta").select("*").order("creado_en", { ascending: false });
    if (fecha) query = query.eq("fecha", fecha);
    if (estado) query = query.eq("estado", estado);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase (hojas_de_ruta): ${error.message}`);

    return NextResponse.json({ success: true, filas: data || [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

// Crea una Hoja de Ruta (cabecera + ítems) y marca los interlocales/guías
// elegidos como "tomados" por esta hoja, para que no se puedan agregar a
// otra por error.
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

    const fecha = typeof body?.fecha === "string" ? body.fecha.trim() : "";
    const localCodigo = typeof body?.localCodigo === "string" ? body.localCodigo.trim() : "";
    const items = Array.isArray(body?.items) ? (body.items as ItemInput[]) : [];

    if (!fecha) return NextResponse.json({ success: false, error: "Falta la fecha." }, { status: 400 });
    if (!localCodigo) return NextResponse.json({ success: false, error: "Falta el local." }, { status: 400 });
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "La hoja de ruta necesita al menos un ítem." }, { status: 400 });
    }
    for (const it of items) {
      if ((it.tipo !== "interlocal" && it.tipo !== "despacho") || !Number.isFinite(it.referenciaId)) {
        return NextResponse.json({ success: false, error: "Hay un ítem con datos inválidos." }, { status: 400 });
      }
    }

    const { data: clienteLocal } = await supabaseAdmin
      .from("clientes")
      .select("codigo, nombre")
      .eq("codigo", localCodigo)
      .maybeSingle();
    if (!clienteLocal) {
      return NextResponse.json({ success: false, error: `No existe ningún local con el código "${localCodigo}".` }, { status: 404 });
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const { data: hoja, error: errorHoja } = await supabaseAdmin
      .from("hojas_de_ruta")
      .insert({
        fecha,
        local_codigo: localCodigo,
        local_nombre: clienteLocal.nombre,
        transporte: typeof body?.transporte === "string" ? body.transporte.trim() || null : null,
        patente: typeof body?.patente === "string" ? body.patente.trim() || null : null,
        chofer: typeof body?.chofer === "string" ? body.chofer.trim() || null : null,
        creado_por_id: auth.userId,
        creado_por_nombre: usuario?.nombre || null,
      })
      .select("*")
      .single();
    if (errorHoja) throw new Error(`Supabase (hojas_de_ruta): ${errorHoja.message}`);

    const interlocalIds = items.filter((i) => i.tipo === "interlocal").map((i) => i.referenciaId);
    const despachoIds = items.filter((i) => i.tipo === "despacho").map((i) => i.referenciaId);

    // Validamos que lo que se quiere agregar siga disponible (nadie lo tomó
    // entremedio para otra hoja) antes de confirmar nada.
    if (interlocalIds.length > 0) {
      const { data: yaTomados, error: errYaTomados } = await supabaseAdmin
        .from("interlocales")
        .select("id")
        .in("id", interlocalIds)
        .neq("estado", "pendiente");
      if (errYaTomados) throw new Error(`Supabase (interlocales): ${errYaTomados.message}`);
      if ((yaTomados || []).length > 0) {
        throw new Error("Alguno de los interlocales elegidos ya se incluyó en otra Hoja de Ruta.");
      }
    }
    if (despachoIds.length > 0) {
      const { data: yaTomadas, error: errYaTomadas } = await supabaseAdmin
        .from("despacho_guias")
        .select("despacho_cab_id")
        .in("despacho_cab_id", despachoIds)
        .not("hoja_de_ruta_id", "is", null);
      if (errYaTomadas) throw new Error(`Supabase (despacho_guias): ${errYaTomadas.message}`);
      if ((yaTomadas || []).length > 0) {
        throw new Error("Alguna de las guías elegidas ya se incluyó en otra Hoja de Ruta.");
      }
    }

    const itemsInsert = items.map((it, idx) => ({
      hoja_de_ruta_id: hoja.id,
      tipo: it.tipo,
      referencia_id: it.referenciaId,
      orden: idx,
    }));
    const { error: errorItems } = await supabaseAdmin.from("hoja_de_ruta_items").insert(itemsInsert);
    if (errorItems) throw new Error(`Supabase (hoja_de_ruta_items): ${errorItems.message}`);

    if (interlocalIds.length > 0) {
      const { error: errUpdInter } = await supabaseAdmin
        .from("interlocales")
        .update({ estado: "en_hoja_de_ruta", hoja_de_ruta_id: hoja.id })
        .in("id", interlocalIds);
      if (errUpdInter) throw new Error(`Supabase (interlocales): ${errUpdInter.message}`);
    }
    if (despachoIds.length > 0) {
      const { error: errUpdDesp } = await supabaseAdmin
        .from("despacho_guias")
        .update({ hoja_de_ruta_id: hoja.id })
        .in("despacho_cab_id", despachoIds);
      if (errUpdDesp) throw new Error(`Supabase (despacho_guias): ${errUpdDesp.message}`);
    }

    return NextResponse.json({ success: true, hoja });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

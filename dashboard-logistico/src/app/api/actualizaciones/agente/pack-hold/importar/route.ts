import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";
import { normalizarContenedor, registrarEvento } from "@/lib/packHold";
import { reconciliarPlanesPorGuiasDespachadas } from "@/lib/packHoldPlanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContenedorImportado {
  contenedor?: string | null;
  unidades?: number | null;
  remito?: string | null;
}

interface PackingImportado {
  contenedor?: string | null;
  sku?: string | null;
  cantidad?: number | null;
}

// Guía tal como la arma el Agente Local (wms-reportes/agente-local.js ->
// correrPedidoPackHold) a partir de las consultas JSON del WMS.
interface GuiaImportada {
  despacho_cab_id: number;
  guia?: string | number | null;
  cliente_codigo?: string | null;
  cliente_nombre?: string | null;
  estado_wms?: string | null;
  fecha_creacion?: string | null;
  contenedores?: ContenedorImportado[];
  packing?: PackingImportado[];
}

const CHUNK = 500;

function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

function lotes<T>(lista: T[], tamano: number): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

// Chequeo liviano del Agente antes del refresco automático: si todavía no se
// corrió el SQL de Pack and Hold, o nadie importó guías nunca, no vale la pena
// consultar el WMS en vano.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { data, error } = await supabaseAdmin.from("ph_guias").select("despacho_cab_id").limit(1);
    if (error) return NextResponse.json({ success: true, listo: false });
    return NextResponse.json({ success: true, listo: true, hayGuias: (data || []).length > 0 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Llamado por el Agente Local en dos fases:
//   - "lote": un grupo de guías con sus contenedores y packing list. Se guarda
//     la foto vigente de cada guía (se reemplazan sus contenedores y su packing
//     list); las posiciones ya registradas NO se tocan.
//   - "cierre": la lista completa de guías que hoy están en DP_INICIADO. Las
//     guías que estaban pendientes y ya no figuran se marcan despachadas y
//     liberan sus posiciones. Si la lista viene vacía no se libera nada (un
//     fallo del WMS no tiene que vaciar el rack).
// Pack and Hold nunca escribe en el WMS: esto es solo lectura de ese lado.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const fase = body?.fase;

    if (fase === "cierre") {
      const ids: number[] = Array.isArray(body?.ids)
        ? (body.ids as unknown[]).filter((n): n is number => typeof n === "number")
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ success: true, despachadas: 0, omitido: true });
      }

      const { data: pendientes, error } = await supabaseAdmin
        .from("ph_guias")
        .select("despacho_cab_id, guia")
        .eq("estado", "pendiente");
      if (error) throw new Error(`Supabase (ph_guias): ${error.message}`);

      const vigentes = new Set(ids);
      const despachadas = (pendientes || []).filter((g: { despacho_cab_id: number }) => !vigentes.has(g.despacho_cab_id));

      if (despachadas.length > 0) {
        const idsDespachadas = despachadas.map((g: { despacho_cab_id: number }) => g.despacho_cab_id);
        const { error: errorUpdate } = await supabaseAdmin
          .from("ph_guias")
          .update({ estado: "despachada", actualizada_en: new Date().toISOString() })
          .in("despacho_cab_id", idsDespachadas);
        if (errorUpdate) throw new Error(`Supabase (ph_guias): ${errorUpdate.message}`);

        const { error: errorLiberar } = await supabaseAdmin
          .from("ph_posiciones")
          .delete()
          .in("despacho_cab_id", idsDespachadas);
        if (errorLiberar) throw new Error(`Supabase (ph_posiciones): ${errorLiberar.message}`);

        // Si alguna estaba en un plan de recogida activo, sus posiciones del plan
        // se dan por cumplidas (ya se despachó) y el plan se cierra si queda completo.
        await reconciliarPlanesPorGuiasDespachadas(idsDespachadas);

        for (const g of despachadas as { guia: string | null }[]) {
          await registrarEvento({
            tipo: "guia_despachada",
            guia: g.guia,
            resultado: "ok",
            mensaje: "La guía ya no está en DP_INICIADO en el WMS: se liberaron sus posiciones.",
          });
        }
      }
      return NextResponse.json({ success: true, despachadas: despachadas.length });
    }

    if (fase !== "lote" || !Array.isArray(body?.guias)) {
      return NextResponse.json({ success: false, error: 'Falta "fase" ("lote" o "cierre").' }, { status: 400 });
    }

    const guias = (body.guias as GuiaImportada[]).filter((g) => g && typeof g.despacho_cab_id === "number");
    if (guias.length === 0) return NextResponse.json({ success: true, guias: 0, contenedores: 0 });

    const ahora = new Date().toISOString();
    const ids = guias.map((g) => g.despacho_cab_id);

    // "estado" no va en el upsert a propósito: una guía nueva entra como
    // pendiente (default) y una ya existente conserva el suyo (ej. retirada).
    const { error: errorGuias } = await supabaseAdmin.from("ph_guias").upsert(
      guias.map((g) => ({
        despacho_cab_id: g.despacho_cab_id,
        guia: aTexto(g.guia),
        cliente_codigo: aTexto(g.cliente_codigo),
        cliente_nombre: aTexto(g.cliente_nombre),
        estado_wms: aTexto(g.estado_wms),
        fecha_creacion: aTexto(g.fecha_creacion),
        total_contenedores: g.contenedores?.length ?? 0,
        actualizada_en: ahora,
      })),
      { onConflict: "despacho_cab_id" }
    );
    if (errorGuias) throw new Error(`Supabase (ph_guias): ${errorGuias.message}`);

    // Una guía que había quedado como despachada y vuelve a estar en
    // DP_INICIADO en el WMS vuelve a pendiente.
    const { error: errorReactivar } = await supabaseAdmin
      .from("ph_guias")
      .update({ estado: "pendiente" })
      .in("despacho_cab_id", ids)
      .eq("estado", "despachada");
    if (errorReactivar) throw new Error(`Supabase (ph_guias): ${errorReactivar.message}`);

    // Foto vigente por guía: se reemplazan sus contenedores y su packing list.
    const { error: errorBorrarCont } = await supabaseAdmin.from("ph_contenedores").delete().in("despacho_cab_id", ids);
    if (errorBorrarCont) throw new Error(`Supabase (ph_contenedores): ${errorBorrarCont.message}`);
    const { error: errorBorrarPack } = await supabaseAdmin.from("ph_packing_list").delete().in("despacho_cab_id", ids);
    if (errorBorrarPack) throw new Error(`Supabase (ph_packing_list): ${errorBorrarPack.message}`);

    // El número de contenedor es único: si viniera repetido se queda con el último.
    const contenedores = new Map<string, { contenedor: string; despacho_cab_id: number; unidades: number | null; remito: string | null }>();
    const packing: { despacho_cab_id: number; contenedor: string; sku: string; cantidad: number | null }[] = [];
    for (const g of guias) {
      for (const c of g.contenedores ?? []) {
        const numero = normalizarContenedor(String(c?.contenedor ?? ""));
        if (!numero) continue;
        contenedores.set(numero, {
          contenedor: numero,
          despacho_cab_id: g.despacho_cab_id,
          unidades: typeof c.unidades === "number" ? c.unidades : null,
          remito: aTexto(c.remito),
        });
      }
      for (const p of g.packing ?? []) {
        const numero = normalizarContenedor(String(p?.contenedor ?? ""));
        const sku = aTexto(p?.sku);
        if (!numero || !sku) continue;
        packing.push({
          despacho_cab_id: g.despacho_cab_id,
          contenedor: numero,
          sku,
          cantidad: typeof p.cantidad === "number" ? p.cantidad : null,
        });
      }
    }

    for (const lote of lotes(Array.from(contenedores.values()), CHUNK)) {
      const { error } = await supabaseAdmin.from("ph_contenedores").upsert(lote, { onConflict: "contenedor" });
      if (error) throw new Error(`Supabase (ph_contenedores): ${error.message}`);
    }
    for (const lote of lotes(packing, CHUNK)) {
      const { error } = await supabaseAdmin.from("ph_packing_list").insert(lote);
      if (error) throw new Error(`Supabase (ph_packing_list): ${error.message}`);
    }

    return NextResponse.json({ success: true, guias: guias.length, contenedores: contenedores.size });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

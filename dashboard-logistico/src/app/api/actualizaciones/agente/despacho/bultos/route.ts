import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fila de detalle que manda el Agente Local, tal como sale de
// wms-reportes/reporte-despachos.js -> detalleDespacho() para cada guía
// del pedido "despacho_importar".
interface FilaBulto {
  despacho_cab_id: number;
  caja?: string | number | null;
  remito?: string | number | null;
  cantidad?: number | null;
}

function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

// Llamado por el Agente Local después de traer el detalle (caja/remito/
// cantidad) de cada guía del pedido -- clasifica cada "caja" contra
// existencia_contenedores_insumo (100% insumo vs producto), reemplaza el
// detalle de esas guías en despacho_guias_bultos y recalcula los
// contadores bultos_insumos / bultos_producto en despacho_guias.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const bultos = body?.bultos;
    if (!Array.isArray(bultos)) {
      return NextResponse.json({ success: false, error: '"bultos" debe ser un array.' }, { status: 400 });
    }

    const filas = (bultos as FilaBulto[])
      .filter((f) => f && typeof f.despacho_cab_id === "number" && aTexto(f.caja))
      .map((f) => ({
        despacho_cab_id: f.despacho_cab_id,
        caja: aTexto(f.caja) as string,
        remito: aTexto(f.remito),
        cantidad: f.cantidad ?? null,
      }));

    const despachoCabIds = Array.from(new Set(filas.map((f) => f.despacho_cab_id)));
    if (despachoCabIds.length === 0) {
      return NextResponse.json({ success: true, bultosProcesados: 0, guiasActualizadas: 0 });
    }

    const { error: delError } = await supabaseAdmin
      .from("despacho_guias_bultos")
      .delete()
      .in("despacho_cab_id", despachoCabIds);
    if (delError) throw new Error(`Supabase (despacho_guias_bultos - borrado): ${delError.message}`);

    const cajas = Array.from(new Set(filas.map((f) => f.caja)));
    const cajasInsumoSet = new Set<string>();
    const CHUNK_IN = 1000;
    for (let i = 0; i < cajas.length; i += CHUNK_IN) {
      const lote = cajas.slice(i, i + CHUNK_IN);
      const { data, error } = await supabaseAdmin
        .from("existencia_contenedores_insumo")
        .select("contenedor")
        .in("contenedor", lote);
      if (error) throw new Error(`Supabase (existencia_contenedores_insumo - lectura): ${error.message}`);
      for (const fila of data ?? []) cajasInsumoSet.add(fila.contenedor);
    }

    const filasParaInsertar = filas.map((f) => ({ ...f, es_insumo: cajasInsumoSet.has(f.caja) }));

    const CHUNK = 500;
    for (let i = 0; i < filasParaInsertar.length; i += CHUNK) {
      const lote = filasParaInsertar.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("despacho_guias_bultos").insert(lote);
      if (error) throw new Error(`Supabase (despacho_guias_bultos - insert): ${error.message}`);
    }

    const conteoPorGuia = new Map<number, { insumos: Set<string>; producto: Set<string> }>();
    for (const f of filasParaInsertar) {
      let contadores = conteoPorGuia.get(f.despacho_cab_id);
      if (!contadores) {
        contadores = { insumos: new Set(), producto: new Set() };
        conteoPorGuia.set(f.despacho_cab_id, contadores);
      }
      (f.es_insumo ? contadores.insumos : contadores.producto).add(f.caja);
    }

    const actualizaciones = despachoCabIds.map((id) => {
      const contadores = conteoPorGuia.get(id);
      return {
        despacho_cab_id: id,
        bultos_insumos: contadores?.insumos.size ?? 0,
        bultos_producto: contadores?.producto.size ?? 0,
      };
    });

    const { error: upError } = await supabaseAdmin
      .from("despacho_guias")
      .upsert(actualizaciones, { onConflict: "despacho_cab_id" });
    if (upError) throw new Error(`Supabase (despacho_guias - contadores): ${upError.message}`);

    return NextResponse.json({
      success: true,
      bultosProcesados: filasParaInsertar.length,
      guiasActualizadas: despachoCabIds.length,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

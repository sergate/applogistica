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

// Fila del packing list (solo guías tipo PROPIO), tal como sale de
// reporte-despachos.js -> obtenerPackingList().
interface FilaPacking {
  despacho_cab_id: number;
  caja?: string | number | null;
  sku?: string | number | null;
  cantidad?: number | null;
}

function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

// Llamado por el Agente Local después de traer, por cada guía del pedido,
// el detalle de bultos (caja/remito/cantidad, todas las guías) y el
// packing list (caja/SKU/cantidad, solo guías PROPIO). El packing list es
// la fuente para el desglose insumo/producto: un "caja" se clasifica
// insumo solo si el 100% de sus SKU están en insumos_skus_maestro. Para
// guías sin packing list (no son PROPIO, o falló la consulta) los
// contadores quedan en null -- "no aplica/no calculado", no "0 insumos".
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const bultos = body?.bultos;
    const packingList = body?.packingList;
    if (!Array.isArray(bultos)) {
      return NextResponse.json({ success: false, error: '"bultos" debe ser un array.' }, { status: 400 });
    }
    if (packingList !== undefined && !Array.isArray(packingList)) {
      return NextResponse.json({ success: false, error: '"packingList" debe ser un array.' }, { status: 400 });
    }

    const filasBultos = (bultos as FilaBulto[])
      .filter((f) => f && typeof f.despacho_cab_id === "number" && aTexto(f.caja))
      .map((f) => ({
        despacho_cab_id: f.despacho_cab_id,
        caja: aTexto(f.caja) as string,
        remito: aTexto(f.remito),
        cantidad: f.cantidad ?? null,
      }));

    const despachoCabIdsBultos = Array.from(new Set(filasBultos.map((f) => f.despacho_cab_id)));
    if (despachoCabIdsBultos.length > 0) {
      const { error: delError } = await supabaseAdmin
        .from("despacho_guias_bultos")
        .delete()
        .in("despacho_cab_id", despachoCabIdsBultos);
      if (delError) throw new Error(`Supabase (despacho_guias_bultos - borrado): ${delError.message}`);

      const CHUNK = 500;
      for (let i = 0; i < filasBultos.length; i += CHUNK) {
        const lote = filasBultos.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin.from("despacho_guias_bultos").insert(lote);
        if (error) throw new Error(`Supabase (despacho_guias_bultos - insert): ${error.message}`);
      }
    }

    const filasPacking = ((packingList as FilaPacking[]) ?? [])
      .filter((f) => f && typeof f.despacho_cab_id === "number" && aTexto(f.caja) && aTexto(f.sku))
      .map((f) => ({
        despacho_cab_id: f.despacho_cab_id,
        caja: aTexto(f.caja) as string,
        sku: aTexto(f.sku) as string,
        cantidad: f.cantidad ?? null,
      }));

    const despachoCabIdsPacking = Array.from(new Set(filasPacking.map((f) => f.despacho_cab_id)));

    if (despachoCabIdsPacking.length > 0) {
      const { error: delPackError } = await supabaseAdmin
        .from("despacho_guias_packing_list")
        .delete()
        .in("despacho_cab_id", despachoCabIdsPacking);
      if (delPackError) throw new Error(`Supabase (despacho_guias_packing_list - borrado): ${delPackError.message}`);

      const CHUNK = 500;
      for (let i = 0; i < filasPacking.length; i += CHUNK) {
        const lote = filasPacking.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin.from("despacho_guias_packing_list").insert(lote);
        if (error) throw new Error(`Supabase (despacho_guias_packing_list - insert): ${error.message}`);
      }

      const { data: skus, error: skusError } = await supabaseAdmin.from("insumos_skus_maestro").select("sku");
      if (skusError) throw new Error(`Supabase (insumos_skus_maestro - lectura): ${skusError.message}`);
      const skusInsumoSet = new Set((skus ?? []).map((s) => s.sku));

      // Por caja: insumo solo si TODOS sus SKU están en el maestro.
      const skusPorCaja = new Map<string, Set<string>>();
      const cabIdPorCaja = new Map<string, number>();
      for (const f of filasPacking) {
        const clave = `${f.despacho_cab_id}__${f.caja}`;
        if (!skusPorCaja.has(clave)) skusPorCaja.set(clave, new Set());
        skusPorCaja.get(clave)!.add(f.sku);
        cabIdPorCaja.set(clave, f.despacho_cab_id);
      }

      const conteoPorGuia = new Map<number, { insumos: number; producto: number }>();
      for (const [clave, skusDeCaja] of skusPorCaja) {
        const cabId = cabIdPorCaja.get(clave)!;
        const esInsumo = Array.from(skusDeCaja).every((sku) => skusInsumoSet.has(sku));
        if (!conteoPorGuia.has(cabId)) conteoPorGuia.set(cabId, { insumos: 0, producto: 0 });
        const contadores = conteoPorGuia.get(cabId)!;
        if (esInsumo) contadores.insumos++;
        else contadores.producto++;
      }

      const actualizaciones = despachoCabIdsPacking.map((id) => ({
        despacho_cab_id: id,
        bultos_insumos: conteoPorGuia.get(id)?.insumos ?? 0,
        bultos_producto: conteoPorGuia.get(id)?.producto ?? 0,
      }));

      const { error: upError } = await supabaseAdmin
        .from("despacho_guias")
        .upsert(actualizaciones, { onConflict: "despacho_cab_id" });
      if (upError) throw new Error(`Supabase (despacho_guias - contadores): ${upError.message}`);
    }

    // Guías del pedido que NO tienen packing list (no son PROPIO, o falló
    // la consulta) -- se limpian los contadores en vez de dejar un valor
    // viejo/incorrecto de una corrida anterior.
    const sinPacking = despachoCabIdsBultos.filter((id) => !despachoCabIdsPacking.includes(id));
    if (sinPacking.length > 0) {
      const { error: limpiarError } = await supabaseAdmin
        .from("despacho_guias")
        .update({ bultos_insumos: null, bultos_producto: null })
        .in("despacho_cab_id", sinPacking);
      if (limpiarError) throw new Error(`Supabase (despacho_guias - limpieza contadores): ${limpiarError.message}`);
    }

    return NextResponse.json({
      success: true,
      bultosProcesados: filasBultos.length,
      packingListProcesado: filasPacking.length,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

import { supabaseAdmin } from "@/lib/supabaseClient";

export interface BultoEsperado {
  codigo: string;
  tipo: "despacho" | "interlocal";
  referencia: string;
}

// Bultos esperados (cajas de despacho_guias_bultos + etiquetas de
// interlocal) de un lote de Hojas de Ruta, en una sola tanda de queries --
// usado tanto al arrancar una sesión de escaneo (una hoja) como al armar el
// detalle del histórico (muchas hojas a la vez).
export async function bultosEsperadosPorHoja(hojaIds: number[]): Promise<Map<number, BultoEsperado[]>> {
  const resultado = new Map<number, BultoEsperado[]>();
  if (hojaIds.length === 0) return resultado;
  for (const id of hojaIds) resultado.set(id, []);

  const { data: items, error: errorItems } = await supabaseAdmin
    .from("hoja_de_ruta_items")
    .select("hoja_de_ruta_id, tipo, referencia_id")
    .in("hoja_de_ruta_id", hojaIds);
  if (errorItems) throw new Error(`Supabase (hoja_de_ruta_items): ${errorItems.message}`);

  const hojaPorDespachoId = new Map<number, number>();
  const hojaPorInterlocalId = new Map<number, number>();
  for (const it of items || []) {
    if (it.tipo === "despacho") hojaPorDespachoId.set(it.referencia_id, it.hoja_de_ruta_id);
    else hojaPorInterlocalId.set(it.referencia_id, it.hoja_de_ruta_id);
  }

  const despachoIds = [...hojaPorDespachoId.keys()];
  const interlocalIds = [...hojaPorInterlocalId.keys()];

  if (despachoIds.length > 0) {
    const { data: bultos, error: errorBultos } = await supabaseAdmin
      .from("despacho_guias_bultos")
      .select("caja, despacho_cab_id")
      .in("despacho_cab_id", despachoIds);
    if (errorBultos) throw new Error(`Supabase (despacho_guias_bultos): ${errorBultos.message}`);

    const { data: guias } = await supabaseAdmin
      .from("despacho_guias")
      .select("despacho_cab_id, numero_guia, guia")
      .in("despacho_cab_id", despachoIds);
    const guiaPorId = new Map((guias || []).map((g) => [g.despacho_cab_id, g.numero_guia || g.guia || String(g.despacho_cab_id)]));

    for (const b of bultos || []) {
      if (!b.caja) continue;
      const hojaId = hojaPorDespachoId.get(b.despacho_cab_id);
      if (!hojaId) continue;
      resultado.get(hojaId)!.push({
        codigo: b.caja,
        tipo: "despacho",
        referencia: `Guía ${guiaPorId.get(b.despacho_cab_id) || b.despacho_cab_id}`,
      });
    }
  }

  if (interlocalIds.length > 0) {
    const { data: interlocales, error: errorInterlocales } = await supabaseAdmin
      .from("interlocales")
      .select("id, numero_etiqueta, numero_movimiento")
      .in("id", interlocalIds);
    if (errorInterlocales) throw new Error(`Supabase (interlocales): ${errorInterlocales.message}`);

    for (const i of interlocales || []) {
      if (!i.numero_etiqueta) continue; // sin etiqueta cargada: no se puede verificar por handheld
      const hojaId = hojaPorInterlocalId.get(i.id);
      if (!hojaId) continue;
      resultado.get(hojaId)!.push({
        codigo: i.numero_etiqueta,
        tipo: "interlocal",
        referencia: `Mov. ${i.numero_movimiento}`,
      });
    }
  }

  return resultado;
}

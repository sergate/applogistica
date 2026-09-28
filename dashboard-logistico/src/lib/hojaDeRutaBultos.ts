import { fetchAllPaginatedIn } from "@/lib/fetchAllPaginated";

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

  const items = await fetchAllPaginatedIn<{ hoja_de_ruta_id: number; tipo: string; referencia_id: number }>(
    "hoja_de_ruta_items",
    "hoja_de_ruta_id, tipo, referencia_id",
    "hoja_de_ruta_id",
    hojaIds
  );

  const hojaPorDespachoId = new Map<number, number>();
  const hojaPorInterlocalId = new Map<number, number>();
  for (const it of items) {
    if (it.tipo === "despacho") hojaPorDespachoId.set(it.referencia_id, it.hoja_de_ruta_id);
    else hojaPorInterlocalId.set(it.referencia_id, it.hoja_de_ruta_id);
  }

  const despachoIds = [...hojaPorDespachoId.keys()];
  const interlocalIds = [...hojaPorInterlocalId.keys()];

  if (despachoIds.length > 0) {
    const bultos = await fetchAllPaginatedIn<{ caja: string | null; despacho_cab_id: number }>(
      "despacho_guias_bultos",
      "caja, despacho_cab_id",
      "despacho_cab_id",
      despachoIds
    );

    const guias = await fetchAllPaginatedIn<{ despacho_cab_id: number; numero_guia: string | null; guia: string | null }>(
      "despacho_guias",
      "despacho_cab_id, numero_guia, guia",
      "despacho_cab_id",
      despachoIds
    );
    const guiaPorId = new Map(guias.map((g) => [g.despacho_cab_id, g.numero_guia || g.guia || String(g.despacho_cab_id)]));

    for (const b of bultos) {
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
    const interlocales = await fetchAllPaginatedIn<{ id: number; numero_etiqueta: string | null; numero_movimiento: string }>(
      "interlocales",
      "id, numero_etiqueta, numero_movimiento",
      "id",
      interlocalIds
    );

    // Una etiqueta por bulto (form "Registrar Interlocal", cantidad_bultos
    // puede ser > 1) -- si un interlocal viejo (previo a esta tabla) no
    // tiene filas acá, caemos al numero_etiqueta único de antes como si
    // fuera su único bulto esperado.
    const etiquetasBultos = await fetchAllPaginatedIn<{ interlocal_id: number; codigo: string }>(
      "interlocales_bultos_etiquetas",
      "interlocal_id, codigo",
      "interlocal_id",
      interlocalIds
    );
    const etiquetasPorInterlocal = new Map<number, string[]>();
    for (const e of etiquetasBultos) {
      if (!etiquetasPorInterlocal.has(e.interlocal_id)) etiquetasPorInterlocal.set(e.interlocal_id, []);
      etiquetasPorInterlocal.get(e.interlocal_id)!.push(e.codigo);
    }

    for (const i of interlocales) {
      const hojaId = hojaPorInterlocalId.get(i.id);
      if (!hojaId) continue;
      const codigos = etiquetasPorInterlocal.get(i.id) || (i.numero_etiqueta ? [i.numero_etiqueta] : []);
      for (const codigo of codigos) {
        resultado.get(hojaId)!.push({
          codigo,
          tipo: "interlocal",
          referencia: `Mov. ${i.numero_movimiento}`,
        });
      }
    }
  }

  return resultado;
}

import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CargaInicialRow {
  numero: string;
  curva: string | null;
  grupo: string | null;
  pedidas: number | null;
  distribuidas: number | null;
  pendientes: number | null;
  stock_total: number | null;
  sku: string | null;
  created_at: string | null;
}

interface ArticuloMasterRow {
  articulo: string;
  observacion: string;
}

const num = (v: number | null): number => Number(v) || 0;

// Mismo criterio que /api/carga-inicial/detalle: un stock_total absurdo
// (error de carga en el archivo origen) cuenta como 0.
const STOCK_MAX_VALIDO = 1_000_000;
const numStock = (v: number | null): number => {
  const n = Number(v) || 0;
  return n > STOCK_MAX_VALIDO ? 0 : n;
};

// El "numero" trae codificados la marca y la temporada, ej: CI_CQQ_VER_001
// (mismo parseo que /api/carga-inicial/detalle).
const MARCA_CODES: Record<string, string> = { CQQ: "CQQTQ", CHK: "CHEEKY", AWA: "AWADA" };
const TEMPORADA_CODES: Record<string, string> = { VER: "VERANO", INV: "INVIERNO" };

function parseNumero(numero: string): { marca: string; temporada: string } {
  const partes = numero.split("_");
  const marcaCod = (partes[1] || "").trim().toUpperCase();
  const tempCod = (partes[2] || "").trim().toUpperCase();
  return {
    marca: MARCA_CODES[marcaCod] || marcaCod || "SIN MARCA",
    temporada: TEMPORADA_CODES[tempCod] || tempCod || "SIN TEMPORADA",
  };
}

const normalizarArticulo = (v: string): string => v.trim().toUpperCase();

// Un artículo master puede venir como el SKU completo o como el prefijo de un
// SKU con variantes. Los SKU de Carga Inicial tienen la forma BASE%COLORTALLE
// (ej. "V2704701%15S"): el artículo "V2704701" matchea todas sus variantes. Se
// prueba el SKU entero y cada prefijo cortado en un separador (%, -, _,
// espacio, punto, /).
function prefijosDeSku(sku: string): string[] {
  const s = normalizarArticulo(sku);
  const prefijos = [s];
  for (let i = 1; i < s.length; i++) {
    if (/[%\-_ ./]/.test(s[i])) prefijos.push(s.slice(0, i));
  }
  return prefijos;
}

// Resumen de Carga Inicial agrupado por colección (= observación de los
// artículos master registrados en Carga Datos): para cada fila de
// carga_inicial cuyo SKU coincide con un artículo master, suma sus unidades
// a la colección de ese artículo. Mismo cálculo por fila que Resumen (a
// repartir = min(pendientes, stock_total), stock = stock_total).
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("CI-Colecciones");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [maestros, rows] = await Promise.all([
      fetchAllPaginated<ArticuloMasterRow>("carga_inicial_articulos_master", "articulo, observacion"),
      fetchAllPaginated<CargaInicialRow>(
        "carga_inicial",
        "numero, curva, grupo, pedidas, distribuidas, pendientes, stock_total, sku, created_at"
      ),
    ]);

    // artículo normalizado -> colecciones a las que pertenece
    const coleccionesPorArticulo = new Map<string, string[]>();
    const articulosPorColeccion = new Map<string, number>();
    for (const m of maestros) {
      const clave = normalizarArticulo(m.articulo);
      const lista = coleccionesPorArticulo.get(clave) ?? [];
      lista.push(m.observacion);
      coleccionesPorArticulo.set(clave, lista);
      articulosPorColeccion.set(m.observacion, (articulosPorColeccion.get(m.observacion) ?? 0) + 1);
    }

    // Códigos que ya traen el "%" (ej. "V2704701%15", artículo + color): el
    // talle va pegado sin separador, así que se matchean por prefijo simple.
    const codigosConPorcentaje = Array.from(coleccionesPorArticulo.keys()).filter((k) => k.includes("%"));

    const grupos = new Map<
      string,
      {
        coleccion: string;
        marca: string;
        curva: string;
        grupo: string;
        temporada: string;
        pedidas: number;
        distribuidas: number;
        aRepartir: number;
        stock: number;
      }
    >();
    let updatedAt: string | null = null;

    for (const r of rows) {
      if (!r.sku) continue;

      // Colecciones de esta fila (sin repetir si varios prefijos apuntan a la misma).
      const colecciones = new Set<string>();
      for (const prefijo of prefijosDeSku(r.sku)) {
        for (const c of coleccionesPorArticulo.get(prefijo) ?? []) colecciones.add(c);
      }
      const skuNormalizado = normalizarArticulo(r.sku);
      for (const codigo of codigosConPorcentaje) {
        if (skuNormalizado.startsWith(codigo)) {
          for (const c of coleccionesPorArticulo.get(codigo) ?? []) colecciones.add(c);
        }
      }
      if (colecciones.size === 0) continue;

      const { marca, temporada } = parseNumero(r.numero);
      const curva = (r.curva || "").trim().toUpperCase() || "SIN CURVA";
      const grupoNombre = (r.grupo || "").trim() || "SIN GRUPO";
      const pendientes = num(r.pendientes);
      const stockTotal = numStock(r.stock_total);

      for (const coleccion of colecciones) {
        const key = `${coleccion}__${marca}__${curva}__${grupoNombre}__${temporada}`;
        if (!grupos.has(key)) {
          grupos.set(key, { coleccion, marca, curva, grupo: grupoNombre, temporada, pedidas: 0, distribuidas: 0, aRepartir: 0, stock: 0 });
        }
        const acc = grupos.get(key)!;
        acc.pedidas += num(r.pedidas);
        acc.distribuidas += num(r.distribuidas);
        acc.aRepartir += Math.min(pendientes, stockTotal);
        acc.stock += stockTotal;
      }

      if (r.created_at && (!updatedAt || r.created_at > updatedAt)) updatedAt = r.created_at;
    }

    return NextResponse.json({
      success: true,
      filas: Array.from(grupos.values()),
      articulosPorColeccion: Object.fromEntries(articulosPorColeccion),
      updatedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

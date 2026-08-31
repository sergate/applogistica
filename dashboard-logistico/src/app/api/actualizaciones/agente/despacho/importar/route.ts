import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fila de cabecera que manda el Agente Local, tal como sale de
// wms-reportes/reporte-despachos.js -> listarDespachos().
interface FilaImportada {
  despacho_cab_id: number;
  guia?: string | number | null;
  numero_guia?: string | number | null;
  numero_comprobante?: string | number | null;
  tipo?: string | null;
  cliente_nombre?: string | null;
  transporte_nombre?: string | null;
  estado_nombre?: string | null;
  fecha_creacion?: string | null;
  cajas?: number | null;
  unidades?: number | null;
  zona?: string | null;
  patente?: string | null;
}

const CHUNK = 500;

function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

// Llamado por el Agente Local después de leer las guías del día desde el
// WMS (despacho/find_by_cab). Upsert por despacho_cab_id: solo pisa los
// campos de cabecera -- las columnas de impresión (guia_impresa,
// remito_impreso, etc.) no vienen en la fila, así que un reimport no las
// toca.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }
  try {
    const auth = await usuarioDesdeTokenAgente(request);
    if (esErrorAuth(auth)) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const filas = body?.filas;
    if (!Array.isArray(filas)) {
      return NextResponse.json({ success: false, error: '"filas" debe ser un array.' }, { status: 400 });
    }

    const ahora = new Date().toISOString();
    const filasParaUpsert = (filas as FilaImportada[])
      .filter((f) => f && typeof f.despacho_cab_id === "number")
      .map((f) => ({
        despacho_cab_id: f.despacho_cab_id,
        guia: aTexto(f.guia),
        numero_guia: aTexto(f.numero_guia),
        numero_comprobante: aTexto(f.numero_comprobante),
        tipo: aTexto(f.tipo),
        cliente: aTexto(f.cliente_nombre),
        transporte: aTexto(f.transporte_nombre),
        estado_wms: aTexto(f.estado_nombre),
        fecha_creacion: f.fecha_creacion || null,
        cajas: f.cajas ?? null,
        unidades: f.unidades ?? null,
        zona: aTexto(f.zona),
        patente: aTexto(f.patente),
        updated_at: ahora,
      }));

    let filasProcesadas = 0;
    for (let i = 0; i < filasParaUpsert.length; i += CHUNK) {
      const lote = filasParaUpsert.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("despacho_guias").upsert(lote, { onConflict: "despacho_cab_id" });
      if (error) throw new Error(`Supabase (despacho_guias - upsert): ${error.message}`);
      filasProcesadas += lote.length;
    }

    return NextResponse.json({ success: true, filasProcesadas });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

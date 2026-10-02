import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { esErrorAuth, usuarioDesdeTokenAgente } from "@/lib/actualizacionesWms";
import { invalidateCache } from "@/lib/queryCache";
import { normalizarNumeroContenedor } from "@/lib/pendienteDespachoHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FilaContenedor {
  contenedor?: string | null;
  marca?: string | null;
  temporada?: string | null;
}

const CHUNK = 500;

function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

// Llamado por el Agente Local con los contenedores Tipo = CI bajados del WMS
// (Contenedores -> "CSV Completo"). Upsert por contenedor: un contenedor ya
// creado no cambia de marca, así que nunca se borra nada.
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

    // Un mismo contenedor repetido en el lote rompería el upsert ("cannot
    // affect row a second time"): se queda con la última aparición.
    const porContenedor = new Map<string, { contenedor: string; marca: string | null; temporada: string | null; updated_at: string }>();
    const ahora = new Date().toISOString();
    for (const f of filas as FilaContenedor[]) {
      const contenedor = normalizarNumeroContenedor(f?.contenedor);
      if (!contenedor) continue;
      porContenedor.set(contenedor, {
        contenedor,
        marca: aTexto(f.marca),
        temporada: aTexto(f.temporada),
        updated_at: ahora,
      });
    }

    const registros = Array.from(porContenedor.values());
    for (let i = 0; i < registros.length; i += CHUNK) {
      const { error } = await supabaseAdmin
        .from("wms_contenedores")
        .upsert(registros.slice(i, i + CHUNK), { onConflict: "contenedor" });
      if (error) throw new Error(`Supabase (wms_contenedores): ${error.message}`);
    }

    invalidateCache("pendiente_despacho:wms_contenedores");
    return NextResponse.json({ success: true, contenedores: registros.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

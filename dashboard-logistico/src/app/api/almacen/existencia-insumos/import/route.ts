import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------
// Se llama en el mismo flujo que /api/almacen/ocupacion/import (mismo
// archivo de Existencia, una sola lectura en el navegador) para clasificar
// qué contenedores son 100% insumo -- todas sus filas cayeron en un Grupo
// marcado como insumo en insumos_grupos_maestro. En el primer lote se borra
// toda la tabla (foto completa y vigente, igual que almacen_ocupacion).
// -----------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ALM-Importar");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { batch, esPrimerLote } = body as { batch: unknown; esPrimerLote: unknown };

    if (!Array.isArray(batch)) {
      return NextResponse.json({ success: false, error: '"batch" debe ser un array.' }, { status: 400 });
    }

    if (esPrimerLote) {
      const { error: delError } = await supabaseAdmin
        .from("existencia_contenedores_insumo")
        .delete()
        .not("contenedor", "is", null);
      if (delError) throw new Error(`Supabase (existencia_contenedores_insumo - borrado total): ${delError.message}`);
    }

    if (batch.length === 0) {
      return NextResponse.json({ success: true, contenedoresInsumo: 0 });
    }

    const { data: grupos, error: gruposError } = await supabaseAdmin
      .from("insumos_grupos_maestro")
      .select("grupo")
      .eq("es_insumo", true);
    if (gruposError) throw new Error(`Supabase (insumos_grupos_maestro - lectura): ${gruposError.message}`);

    const gruposInsumoSet = new Set((grupos ?? []).map((g) => g.grupo));

    const actualizadoEn = new Date().toISOString();
    const filas = (batch as { contenedor?: unknown; grupos?: unknown }[])
      .filter((f): f is { contenedor: string; grupos: string[] } => {
        if (typeof f?.contenedor !== "string" || !f.contenedor.trim()) return false;
        if (!Array.isArray(f.grupos) || f.grupos.length === 0) return false;
        return f.grupos.every((g) => typeof g === "string" && gruposInsumoSet.has(g));
      })
      .map((f) => ({ contenedor: f.contenedor.trim(), actualizado_en: actualizadoEn }));

    if (filas.length === 0) {
      return NextResponse.json({ success: true, contenedoresInsumo: 0 });
    }

    const { error, count } = await supabaseAdmin
      .from("existencia_contenedores_insumo")
      .upsert(filas, { onConflict: "contenedor", count: "exact" });

    if (error) throw new Error(`Supabase (existencia_contenedores_insumo - upsert): ${error.message}`);

    return NextResponse.json({ success: true, contenedoresInsumo: count ?? filas.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

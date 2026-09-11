import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Config compartida (afecta a todos los usuarios) de qué "Grupo" del
// archivo de Existencia cuenta como insumo -- se usa para clasificar
// contenedores 100% insumo al importar Existencia (mismo import de
// Ocupación Almacén) y así desglosar bultos insumo/producto por guía.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ALM-InsumosGrupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("insumos_grupos_maestro")
      .select("grupo, es_insumo")
      .order("grupo");
    if (error) throw new Error(`Supabase (insumos_grupos_maestro): ${error.message}`);

    return NextResponse.json({ success: true, items: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ALM-InsumosGrupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const items = body?.items;

    if (!Array.isArray(items)) {
      return NextResponse.json({ success: false, error: '"items" debe ser un array.' }, { status: 400 });
    }

    const { data: usuario } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", auth.userId).single();

    const filas = (items as Record<string, unknown>[])
      .map((it) => ({
        grupo: typeof it?.grupo === "string" ? it.grupo.trim() : "",
        es_insumo: it?.es_insumo === true,
        actualizado_en: new Date().toISOString(),
        actualizado_por_nombre: usuario?.nombre || null,
      }))
      .filter((it) => it.grupo);

    if (filas.length > 0) {
      const { error } = await supabaseAdmin.from("insumos_grupos_maestro").upsert(filas, { onConflict: "grupo" });
      if (error) throw new Error(`Supabase (insumos_grupos_maestro): ${error.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

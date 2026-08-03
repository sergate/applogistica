import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { invalidateCache } from "@/lib/queryCache";
import { CATALOGO_ZONAS_ALMACEN } from "@/lib/almacenHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Config compartida (afecta a todos los usuarios) de qué grupos/sub-filas
// se muestran en Ocupación Almacén - Resumen. Por default todo está
// habilitado -- esta tabla solo guarda las excepciones deshabilitadas.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ALM-Configuracion");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin.from("almacen_indicadores_config").select("grupo, subzona, habilitado");
    if (error) throw new Error(`Supabase (almacen_indicadores_config): ${error.message}`);

    const deshabilitados = new Set(
      (data ?? []).filter((r) => r.habilitado === false).map((r) => `${r.grupo}__${r.subzona}`)
    );

    const items = CATALOGO_ZONAS_ALMACEN.map((z) => ({
      grupo: z.grupo,
      subzona: z.subzona,
      habilitado: !deshabilitados.has(`${z.grupo}__${z.subzona}`),
    }));

    return NextResponse.json({ success: true, items });
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

  const auth = await requireAdminPermission("ALM-Configuracion");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const items = body?.items;

    if (!Array.isArray(items)) {
      return NextResponse.json({ success: false, error: '"items" debe ser un array.' }, { status: 400 });
    }

    const filas = (items as Record<string, unknown>[])
      .map((it) => ({
        grupo: typeof it?.grupo === "string" ? it.grupo.trim() : "",
        subzona: typeof it?.subzona === "string" ? it.subzona.trim() : "",
        habilitado: it?.habilitado !== false,
      }))
      .filter((it) => it.grupo && it.subzona);

    if (filas.length > 0) {
      const { error } = await supabaseAdmin
        .from("almacen_indicadores_config")
        .upsert(filas, { onConflict: "grupo,subzona" });
      if (error) throw new Error(`Supabase (almacen_indicadores_config): ${error.message}`);
    }

    invalidateCache("almacen_indicadores:");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

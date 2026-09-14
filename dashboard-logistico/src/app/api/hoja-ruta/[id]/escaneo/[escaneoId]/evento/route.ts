import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registra un escaneo individual dentro de una sesión -- el handheld ya
// resolvió localmente (contra la lista de bultosEsperados que le dio
// /iniciar) si el código pertenece a la hoja, es nuevo o ya estaba
// escaneado; acá solo se persiste el evento para la auditoría completa.
// "tipo" viaja null cuando el código no pertenece a la hoja (no sabemos a
// qué tipo de bulto corresponde).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; escaneoId: string }> }
) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { escaneoId } = await params;
    const escaneoIdNum = Number(escaneoId);
    if (!Number.isFinite(escaneoIdNum)) {
      return NextResponse.json({ success: false, error: "ID de escaneo inválido." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";
    const tipo = body?.tipo === "despacho" || body?.tipo === "interlocal" ? body.tipo : null;
    const resultado = body?.resultado;
    if (!codigo || (resultado !== "ok_nuevo" && resultado !== "ok_duplicado" && resultado !== "no_pertenece")) {
      return NextResponse.json({ success: false, error: "Body inválido." }, { status: 400 });
    }

    const { data: escaneo } = await supabaseAdmin
      .from("hoja_de_ruta_escaneos")
      .select("id, finalizado_en")
      .eq("id", escaneoIdNum)
      .maybeSingle();
    if (!escaneo) return NextResponse.json({ success: false, error: "No existe esa sesión de escaneo." }, { status: 404 });
    if (escaneo.finalizado_en) {
      return NextResponse.json({ success: false, error: "Esta sesión de escaneo ya se cerró." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("hoja_de_ruta_escaneo_eventos").insert({
      escaneo_id: escaneoIdNum,
      codigo,
      tipo,
      resultado,
    });
    if (error) throw new Error(`Supabase (hoja_de_ruta_escaneo_eventos): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

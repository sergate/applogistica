import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Faltante {
  codigo: string;
  tipo: "despacho" | "interlocal";
}

// Cierra una sesión de escaneo. Si el handheld manda "faltantes" (no vacío)
// es porque el usuario eligió "Cerrar con faltante" -- se registran esos
// bultos en hoja_de_ruta_bultos_faltantes y la sesión queda "incompleto".
// Si "faltantes" viene vacío, la sesión queda "completo".
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
    const { id, escaneoId } = await params;
    const hojaId = Number(id);
    const escaneoIdNum = Number(escaneoId);
    if (!Number.isFinite(hojaId) || !Number.isFinite(escaneoIdNum)) {
      return NextResponse.json({ success: false, error: "ID inválido." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const bultosEscaneados = typeof body?.bultosEscaneados === "number" ? body.bultosEscaneados : null;
    const faltantes = Array.isArray(body?.faltantes) ? (body.faltantes as Faltante[]) : [];
    if (bultosEscaneados === null) {
      return NextResponse.json({ success: false, error: '"bultosEscaneados" es requerido.' }, { status: 400 });
    }

    const { data: escaneo } = await supabaseAdmin
      .from("hoja_de_ruta_escaneos")
      .select("id, finalizado_en, hoja_de_ruta_id")
      .eq("id", escaneoIdNum)
      .maybeSingle();
    if (!escaneo || escaneo.hoja_de_ruta_id !== hojaId) {
      return NextResponse.json({ success: false, error: "No existe esa sesión de escaneo." }, { status: 404 });
    }
    if (escaneo.finalizado_en) {
      return NextResponse.json({ success: false, error: "Esta sesión de escaneo ya se cerró." }, { status: 400 });
    }

    if (faltantes.length > 0) {
      const { error: errorFaltantes } = await supabaseAdmin.from("hoja_de_ruta_bultos_faltantes").insert(
        faltantes.map((f) => ({
          escaneo_id: escaneoIdNum,
          hoja_de_ruta_id: hojaId,
          codigo: f.codigo,
          tipo: f.tipo,
        }))
      );
      if (errorFaltantes) throw new Error(`Supabase (hoja_de_ruta_bultos_faltantes): ${errorFaltantes.message}`);
    }

    const { data, error } = await supabaseAdmin
      .from("hoja_de_ruta_escaneos")
      .update({
        finalizado_en: new Date().toISOString(),
        bultos_escaneados: bultosEscaneados,
        resultado: faltantes.length > 0 ? "incompleto" : "completo",
      })
      .eq("id", escaneoIdNum)
      .select("*")
      .single();
    if (error) throw new Error(`Supabase (hoja_de_ruta_escaneos): ${error.message}`);

    return NextResponse.json({ success: true, escaneo: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

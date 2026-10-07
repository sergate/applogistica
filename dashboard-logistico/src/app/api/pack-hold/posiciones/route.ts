import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { registrarPosicion, statusDeErrorRegistro } from "@/lib/packHold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registrar una posición desde escritorio (carga manual o corrección). Usa las
// mismas reglas que el handheld: contenedor en una guía pendiente, posición en
// el layout y en una zona habilitada, una guía por posición, guía fuera de un
// plan activo.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Liberar");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const contenedor = typeof body?.contenedor === "string" ? body.contenedor : "";
    const posicion = typeof body?.posicion === "string" ? body.posicion : "";
    if (!contenedor.trim() || !posicion.trim()) {
      return NextResponse.json({ success: false, error: "Faltan el contenedor y la posición." }, { status: 400 });
    }

    const resultado = await registrarPosicion({ contenedor, posicion, userId: auth.userId });
    if (!resultado.ok) {
      return NextResponse.json(
        { success: false, codigo: resultado.codigo, error: resultado.mensaje },
        { status: statusDeErrorRegistro(resultado.codigo) }
      );
    }
    return NextResponse.json({ success: true, ...resultado });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

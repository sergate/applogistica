import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { registrarPosicion, statusDeErrorRegistro } from "@/lib/packHold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Handheld, función "Ubicar": el operario escanea un contenedor de la guía y
// después la posición. Una posición registrada alcanza para que la guía quede
// ubicada; si ocupa más de una, se repite el paso en cada una.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Handheld");
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

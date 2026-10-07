import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchPlanes } from "@/lib/packHoldPlanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Handheld, función "Despacho": desplegable con los planes de recogida
// pendientes (o en curso) y su avance.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Handheld");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const planes = await fetchPlanes({ conCerrados: false });
    return NextResponse.json({
      success: true,
      planes: planes.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        clienteNombre: p.clienteNombre,
        estado: p.estado,
        guias: p.guias.length,
        posiciones: p.posiciones.length,
        recogidas: p.posiciones.filter((x) => x.ok).length,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

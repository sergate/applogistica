import { NextRequest, NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { crearPlan, fetchPlanes } from "@/lib/packHoldPlanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface GuiaRow {
  despacho_cab_id: number;
  guia: string | null;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
  estado: string;
  total_contenedores: number | null;
}

// Pantalla "Planes de Recogida": los planes (activos y los últimos cerrados) y
// las guías que se pueden sumar a un plan nuevo: pendientes, ya ubicadas y que
// no estén en otro plan activo.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Planes");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [planes, guiasTodas, posiciones] = await Promise.all([
      fetchPlanes({ conCerrados: true }),
      fetchAllPaginated<GuiaRow>(
        "ph_guias",
        "despacho_cab_id, guia, cliente_codigo, cliente_nombre, estado, total_contenedores"
      ),
      fetchAllPaginated<{ posicion: string; despacho_cab_id: number }>("ph_posiciones", "posicion, despacho_cab_id"),
    ]);

    const enPlanActivo = new Set<number>();
    for (const p of planes) {
      if (p.estado === "pendiente" || p.estado === "en_curso") {
        for (const g of p.guias) enPlanActivo.add(g.despachoCabId);
      }
    }

    const posicionesPorGuia = new Map<number, string[]>();
    for (const p of posiciones) {
      const lista = posicionesPorGuia.get(p.despacho_cab_id) ?? [];
      lista.push(p.posicion);
      posicionesPorGuia.set(p.despacho_cab_id, lista);
    }

    const guiasDisponibles = guiasTodas
      .filter((g) => g.estado === "pendiente" && posicionesPorGuia.has(g.despacho_cab_id) && !enPlanActivo.has(g.despacho_cab_id))
      .map((g) => ({
        despachoCabId: g.despacho_cab_id,
        guia: g.guia ?? "",
        clienteCodigo: g.cliente_codigo ?? "",
        cliente: (g.cliente_nombre ?? "SIN CLIENTE").trim(),
        contenedores: g.total_contenedores ?? 0,
        posiciones: (posicionesPorGuia.get(g.despacho_cab_id) ?? []).sort(),
      }))
      .sort((a, b) => a.cliente.localeCompare(b.cliente) || a.guia.localeCompare(b.guia));

    return NextResponse.json({ success: true, planes, guiasDisponibles });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

// Crea un plan con las guías elegidas (todas del mismo cliente).
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Planes");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const ids: number[] = Array.isArray(body?.despachoCabIds)
      ? (body.despachoCabIds as unknown[]).filter((n): n is number => typeof n === "number")
      : [];

    const resultado = await crearPlan({ despachoCabIds: ids, userId: auth.userId });
    if (!resultado.ok) {
      return NextResponse.json({ success: false, error: resultado.mensaje }, { status: resultado.status });
    }
    return NextResponse.json({ success: true, ...resultado });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

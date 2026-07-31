import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { invalidateCache } from "@/lib/queryCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("REMA Manual");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("pedidos_rema_manual")
      .select("id, pedido, nota, created_at")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Supabase (pedidos_rema_manual): ${error.message}`);

    return NextResponse.json({ success: true, pedidos: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Acepta uno o varios pedidos por request (pegar una lista completa de una).
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("REMA Manual");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const pedidosRaw: unknown = body?.pedidos;
    const nota = typeof body?.nota === "string" ? body.nota.trim() || null : null;

    if (!Array.isArray(pedidosRaw)) {
      return NextResponse.json({ success: false, error: '"pedidos" debe ser un array.' }, { status: 400 });
    }

    const pedidos = Array.from(
      new Set(
        pedidosRaw
          .map((p) => (typeof p === "string" ? p.trim() : ""))
          .filter((p) => p.length > 0)
      )
    );

    if (pedidos.length === 0) {
      return NextResponse.json({ success: false, error: "No se recibió ningún pedido válido." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("pedidos_rema_manual")
      .upsert(
        pedidos.map((pedido) => ({ pedido, nota })),
        { onConflict: "pedido", ignoreDuplicates: true }
      )
      .select("id, pedido, nota, created_at");

    if (error) throw new Error(`Supabase (pedidos_rema_manual): ${error.message}`);

    invalidateCache("pedidos_rema_manual:");

    return NextResponse.json({ success: true, agregados: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

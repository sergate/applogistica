import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Últimos movimientos de Personal CD (altas/bajas de Dotación, ediciones y
// cargas de Vacaciones) -- ver registrarAuditoria() en src/lib/personalAuditoria.ts.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Auditoria");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data: registros, error } = await supabaseAdmin
      .from("personal_cd_auditoria")
      .select("id, created_at, accion, legajo, detalle, usuario_id")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(`Supabase (personal_cd_auditoria): ${error.message}`);

    const usuarioIds = [...new Set((registros || []).map((r) => r.usuario_id))];
    const { data: usuarios, error: errorUsuarios } =
      usuarioIds.length > 0
        ? await supabaseAdmin.from("usuarios").select("id, email, nombre").in("id", usuarioIds)
        : { data: [], error: null };
    if (errorUsuarios) throw new Error(`Supabase (usuarios): ${errorUsuarios.message}`);

    const usuarioPorId = new Map((usuarios || []).map((u) => [u.id, u]));

    const movimientos = (registros || []).map((r) => {
      const usuario = usuarioPorId.get(r.usuario_id);
      return {
        id: r.id,
        fecha: r.created_at,
        accion: r.accion,
        legajo: r.legajo,
        detalle: r.detalle,
        usuario: usuario?.nombre || usuario?.email || "Usuario eliminado",
      };
    });

    return NextResponse.json({ success: true, movimientos });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

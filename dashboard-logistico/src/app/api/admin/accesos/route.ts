import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE = 500;

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("ADMIN-Accesos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("log_accesos")
      .select("id, subseccion_key, fecha_hora, usuarios(email, nombre)")
      .order("fecha_hora", { ascending: false })
      .limit(LIMITE);

    if (error) throw new Error(`Supabase (log_accesos): ${error.message}`);

    const accesos = (data ?? []).map((a) => {
      const usuario = Array.isArray(a.usuarios)
        ? (a.usuarios[0] as { email: string; nombre: string | null } | undefined)
        : (a.usuarios as unknown as { email: string; nombre: string | null } | null);
      return {
        id: a.id,
        subseccionKey: a.subseccion_key,
        fechaHora: a.fecha_hora,
        usuarioEmail: usuario?.email || "Usuario eliminado",
        usuarioNombre: usuario?.nombre || null,
      };
    });

    return NextResponse.json({ success: true, accesos });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

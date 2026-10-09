import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface EventoRow {
  id: number;
  tipo: string;
  contenedor: string | null;
  guia: string | null;
  posicion: string | null;
  plan_codigo: string | null;
  resultado: "ok" | "error";
  mensaje: string | null;
  usuario_id: string | null;
  ocurrido_en: string;
}

const DIAS_ATRAS = 30;
const MAX_EVENTOS = 5000;
const PAGINA = 1000;

// Categorías del filtro: guardado en rack, proceso de planes y picking.
const CATEGORIA_POR_TIPO: Record<string, "rack" | "planes" | "picking"> = {
  registrar_posicion: "rack",
  posicion_ya_registrada: "rack",
  liberar_posicion: "rack",
  guia_despachada: "rack",
  crear_plan: "planes",
  cancelar_plan: "planes",
  plan_completo: "planes",
  recoger_posicion: "picking",
};

// Registro de eventos de Pack and Hold (solo admin): los últimos 30 días, del
// más nuevo al más viejo, con el nombre de quien hizo cada acción.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Eventos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 60 * 60 * 1000).toISOString();
    const filas: EventoRow[] = [];
    for (let inicio = 0; inicio < MAX_EVENTOS; inicio += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from("ph_eventos")
        .select("id, tipo, contenedor, guia, posicion, plan_codigo, resultado, mensaje, usuario_id, ocurrido_en")
        .gte("ocurrido_en", desde)
        .order("ocurrido_en", { ascending: false })
        .order("id", { ascending: false })
        .range(inicio, inicio + PAGINA - 1);
      if (error) throw new Error(`Supabase (ph_eventos): ${error.message}`);
      filas.push(...((data || []) as EventoRow[]));
      if (!data || data.length < PAGINA) break;
    }

    const usuarioIds = [...new Set(filas.map((f) => f.usuario_id).filter((id): id is string => !!id))];
    const { data: usuarios } = usuarioIds.length
      ? await supabaseAdmin.from("usuarios").select("id, nombre").in("id", usuarioIds)
      : { data: [] };
    const nombrePorId = new Map((usuarios || []).map((u: { id: string; nombre: string }) => [u.id, u.nombre]));

    const eventos = filas.map((f) => ({
      id: f.id,
      fecha: f.ocurrido_en,
      tipo: f.tipo,
      categoria: CATEGORIA_POR_TIPO[f.tipo] ?? "rack",
      guia: f.guia ?? "",
      contenedor: f.contenedor ?? "",
      posicion: f.posicion ?? "",
      plan: f.plan_codigo ?? "",
      resultado: f.resultado,
      mensaje: f.mensaje ?? "",
      usuario: f.usuario_id ? nombrePorId.get(f.usuario_id) ?? "Usuario eliminado" : "Sistema",
    }));

    return NextResponse.json({ success: true, eventos, diasAtras: DIAS_ATRAS, truncado: filas.length >= MAX_EVENTOS });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

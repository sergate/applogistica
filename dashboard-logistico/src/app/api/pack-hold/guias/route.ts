import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { diasHabilesEntre } from "@/lib/diasHabiles";

// Fecha (YYYY-MM-DD) en horario de Argentina: la creación viene en UTC y a la
// noche cambiaría de día si se cortara en UTC.
const fechaArgentina = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);

const DIA_MS = 24 * 60 * 60 * 1000;

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
  fecha_creacion: string | null;
  actualizada_en: string | null;
}

interface PosicionRow {
  posicion: string;
  despacho_cab_id: number;
  guia: string | null;
  cliente_nombre: string | null;
  registrada_en: string | null;
  registrada_por: string | null;
}

interface PlanGuiaRow {
  despacho_cab_id: number;
  ph_planes: { codigo: string; estado: string } | { codigo: string; estado: string }[] | null;
}

// Pantalla "Posiciones y Guías": las guías pendientes de despacho (importadas
// del WMS) con las posiciones donde está cada una, y el mapa de posiciones
// ocupadas. Una guía está "ubicada" apenas tiene una posición registrada: no
// hay ubicaciones parciales.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Posiciones");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [guiasTodas, posiciones, planGuias, feriadosRows] = await Promise.all([
      fetchAllPaginated<GuiaRow>(
        "ph_guias",
        "despacho_cab_id, guia, cliente_codigo, cliente_nombre, estado, total_contenedores, fecha_creacion, actualizada_en"
      ),
      fetchAllPaginated<PosicionRow>(
        "ph_posiciones",
        "posicion, despacho_cab_id, guia, cliente_nombre, registrada_en, registrada_por"
      ),
      fetchAllPaginated<PlanGuiaRow>("ph_plan_guias", "despacho_cab_id, ph_planes(codigo, estado)"),
      fetchAllPaginated<{ fecha: string }>("feriados", "fecha"),
    ]);

    const feriados = new Set(feriadosRows.map((f) => f.fecha));
    const hoy = fechaArgentina(new Date());

    const guiasPendientes = guiasTodas.filter((g) => g.estado === "pendiente");

    // Plan activo (pendiente o en curso) de cada guía.
    const planPorGuia = new Map<number, string>();
    for (const fila of planGuias) {
      const plan = Array.isArray(fila.ph_planes) ? fila.ph_planes[0] : fila.ph_planes;
      if (plan && (plan.estado === "pendiente" || plan.estado === "en_curso")) {
        planPorGuia.set(fila.despacho_cab_id, plan.codigo);
      }
    }

    const posicionesPorGuia = new Map<number, string[]>();
    for (const p of posiciones) {
      const lista = posicionesPorGuia.get(p.despacho_cab_id) ?? [];
      lista.push(p.posicion);
      posicionesPorGuia.set(p.despacho_cab_id, lista);
    }

    // Nombres de quienes registraron cada posición.
    const usuarioIds = [...new Set(posiciones.map((p) => p.registrada_por).filter((id): id is string => !!id))];
    const { data: usuarios } = usuarioIds.length
      ? await supabaseAdmin.from("usuarios").select("id, nombre").in("id", usuarioIds)
      : { data: [] };
    const nombrePorId = new Map((usuarios || []).map((u: { id: string; nombre: string }) => [u.id, u.nombre]));

    let ultimaImportacion: string | null = null;
    for (const g of guiasTodas) {
      if (g.actualizada_en && (!ultimaImportacion || g.actualizada_en > ultimaImportacion)) {
        ultimaImportacion = g.actualizada_en;
      }
    }

    const guias = guiasPendientes.map((g) => {
      const posicionesGuia = (posicionesPorGuia.get(g.despacho_cab_id) ?? []).sort();
      // Antigüedad: días hábiles transcurridos desde la creación hasta hoy (creada hoy = 0).
      const fecha = g.fecha_creacion ? fechaArgentina(new Date(g.fecha_creacion)) : null;
      const diaSiguiente = fecha ? fechaArgentina(new Date(new Date(`${fecha}T12:00:00Z`).getTime() + DIA_MS)) : null;
      const antiguedad = fecha && diaSiguiente ? diasHabilesEntre(diaSiguiente, hoy, feriados) : null;
      return {
        fecha,
        antiguedad,
        despachoCabId: g.despacho_cab_id,
        guia: g.guia ?? "",
        clienteCodigo: g.cliente_codigo ?? "",
        cliente: (g.cliente_nombre ?? "SIN CLIENTE").trim(),
        contenedores: g.total_contenedores ?? 0,
        fechaCreacion: g.fecha_creacion,
        posiciones: posicionesGuia,
        estado: posicionesGuia.length > 0 ? ("ubicada" as const) : ("sin_ubicar" as const),
        plan: planPorGuia.get(g.despacho_cab_id) ?? null,
      };
    });

    const pendientes = new Set(guiasPendientes.map((g) => g.despacho_cab_id));
    const posicionesOcupadas = posiciones
      .filter((p) => pendientes.has(p.despacho_cab_id))
      .map((p) => ({
        posicion: p.posicion,
        guia: p.guia ?? "",
        despachoCabId: p.despacho_cab_id,
        cliente: (p.cliente_nombre ?? "SIN CLIENTE").trim(),
        registradaEn: p.registrada_en,
        registradaPor: p.registrada_por ? nombrePorId.get(p.registrada_por) ?? null : null,
        plan: planPorGuia.get(p.despacho_cab_id) ?? null,
      }))
      .sort((a, b) => a.posicion.localeCompare(b.posicion));

    return NextResponse.json({ success: true, guias, posiciones: posicionesOcupadas, ultimaImportacion });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { esLunesISO, fetchEmpleadosConUso } from "@/lib/personalCupos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_SEMANAS_POR_PEDIDO = 80;
const CUPO_MAXIMO = 999;

// Pantalla "Cupos Vacaciones": los puestos de la lista maestra con su cupo por semana,
// lo usado (empleados del puesto con días de vacaciones cargados esa semana, calculado
// desde Vacaciones) y las tarjetas de comparación. Todo el ciclo en una sola respuesta;
// el trimestre a mostrar lo recorta el frontend, igual que en Vacaciones.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Cupos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [puestosRes, cuposFilas, tarjetasRes] = await Promise.all([
      supabaseAdmin.from("personal_cd_puestos").select("id, nombre, activo").order("nombre"),
      fetchAllPaginated<{ puesto_id: number; semana_inicio: string; cupo: number }>(
        "personal_cd_cupos_vacaciones",
        "puesto_id, semana_inicio, cupo"
      ),
      supabaseAdmin.from("personal_cd_cupos_tarjetas").select("id, nombre, puestos_ids").order("id"),
    ]);
    if (puestosRes.error) throw new Error(`Supabase (personal_cd_puestos): ${puestosRes.error.message}`);
    if (tarjetasRes.error) throw new Error(`Supabase (personal_cd_cupos_tarjetas): ${tarjetasRes.error.message}`);

    const puestos = (puestosRes.data || []) as { id: number; nombre: string; activo: boolean }[];
    const empleados = await fetchEmpleadosConUso(puestos);

    const empleadosPorPuesto: Record<number, number> = {};
    const usado: Record<string, number> = {};
    for (const e of empleados) {
      empleadosPorPuesto[e.puestoId] = (empleadosPorPuesto[e.puestoId] ?? 0) + 1;
      for (const semana of e.cargas.keys()) {
        const clave = `${e.puestoId}|${semana}`;
        usado[clave] = (usado[clave] ?? 0) + 1;
      }
    }

    const cupos: Record<string, number> = {};
    for (const f of cuposFilas) cupos[`${f.puesto_id}|${f.semana_inicio}`] = f.cupo;

    return NextResponse.json({
      success: true,
      puestos: puestos.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre, empleados: empleadosPorPuesto[p.id] ?? 0 })),
      sinPuesto: { empleados: empleadosPorPuesto[0] ?? 0 },
      cupos,
      usado,
      tarjetas: (tarjetasRes.data || []).map((t) => ({ id: t.id, nombre: t.nombre, puestosIds: (t.puestos_ids ?? []) as number[] })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Asigna el cupo de UN puesto en una o varias semanas ({ puestoId, semanas: [lunes...], cupo }).
// Un cupo de 0 saca la fila: queda "sin cupo asignado".
export async function PUT(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-CuposEditar");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const puestoId = Number(body?.puestoId);
    const cupo = Number(body?.cupo);
    const semanas: unknown[] = Array.isArray(body?.semanas) ? body.semanas : [];

    if (!Number.isInteger(puestoId) || puestoId < 1) {
      return NextResponse.json({ success: false, error: "Elegí un puesto." }, { status: 400 });
    }
    if (!Number.isInteger(cupo) || cupo < 0 || cupo > CUPO_MAXIMO) {
      return NextResponse.json(
        { success: false, error: `El cupo tiene que ser un entero entre 0 y ${CUPO_MAXIMO}.` },
        { status: 400 }
      );
    }
    if (semanas.length === 0 || semanas.length > MAX_SEMANAS_POR_PEDIDO || !semanas.every(esLunesISO)) {
      return NextResponse.json({ success: false, error: "Las semanas tienen que ser fechas de lunes válidas." }, { status: 400 });
    }
    const lunes = [...new Set(semanas as string[])];

    const { data: puesto, error: errorPuesto } = await supabaseAdmin
      .from("personal_cd_puestos")
      .select("id")
      .eq("id", puestoId)
      .maybeSingle();
    if (errorPuesto) throw new Error(`Supabase (personal_cd_puestos): ${errorPuesto.message}`);
    if (!puesto) return NextResponse.json({ success: false, error: "El puesto no existe." }, { status: 404 });

    if (cupo === 0) {
      const { error } = await supabaseAdmin
        .from("personal_cd_cupos_vacaciones")
        .delete()
        .eq("puesto_id", puestoId)
        .in("semana_inicio", lunes);
      if (error) throw new Error(`Supabase (personal_cd_cupos_vacaciones): ${error.message}`);
    } else {
      const ahora = new Date().toISOString();
      const { error } = await supabaseAdmin.from("personal_cd_cupos_vacaciones").upsert(
        lunes.map((semana) => ({
          puesto_id: puestoId,
          semana_inicio: semana,
          cupo,
          actualizado_por: auth.userId,
          actualizado_en: ahora,
        })),
        { onConflict: "puesto_id,semana_inicio" }
      );
      if (error) throw new Error(`Supabase (personal_cd_cupos_vacaciones): ${error.message}`);
    }

    return NextResponse.json({ success: true, semanas: lunes.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

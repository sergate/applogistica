import { supabaseAdmin } from "@/lib/supabaseClient";
import {
  normalizarContenedor,
  normalizarPosicion,
  planActivoDeGuia,
  registrarEvento,
  type ResultadoLiberar,
} from "@/lib/packHold";

// Planes de recogida de Pack and Hold: crear, cancelar y recoger posiciones.
// Nunca escribe en el WMS: el despacho final se sigue haciendo allá.

/** Parte "cliente" del código de plan: sin tildes ni símbolos, en mayúsculas. */
function slugCliente(nombre: string | null, codigo: string): string {
  const base = (nombre || codigo || "CLIENTE")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return base || "CLIENTE";
}

export type ResultadoPlan =
  | { ok: true; planId: number; codigo: string; guias: number; posiciones: number }
  | { ok: false; status: number; mensaje: string };

/**
 * Crea un plan de recogida de una o más guías de UN solo cliente (para que los
 * pallets en el piso no se mezclen). Solo entran guías pendientes, ya ubicadas
 * y que no estén en otro plan activo. Las posiciones se congelan en el plan,
 * ordenadas de menor a mayor.
 */
export async function crearPlan(params: { despachoCabIds: number[]; userId: string }): Promise<ResultadoPlan> {
  const ids = [...new Set(params.despachoCabIds.filter((n) => Number.isInteger(n)))];
  if (ids.length === 0) return { ok: false, status: 400, mensaje: "Elegí al menos una guía." };

  const { data: guias, error: errorGuias } = await supabaseAdmin
    .from("ph_guias")
    .select("despacho_cab_id, guia, cliente_codigo, cliente_nombre, estado")
    .in("despacho_cab_id", ids);
  if (errorGuias) throw new Error(`Supabase (ph_guias): ${errorGuias.message}`);
  const lista = guias || [];
  if (lista.length !== ids.length) return { ok: false, status: 404, mensaje: "Alguna de las guías ya no existe." };

  const noPendiente = lista.find((g) => g.estado !== "pendiente");
  if (noPendiente) {
    return { ok: false, status: 409, mensaje: `La guía ${noPendiente.guia} ya no está pendiente de despacho.` };
  }
  const clientes = new Set(lista.map((g) => g.cliente_codigo ?? ""));
  if (clientes.size > 1) {
    return {
      ok: false,
      status: 400,
      mensaje: "Un plan es de un solo cliente: no se pueden mezclar guías de clientes distintos.",
    };
  }

  for (const g of lista) {
    const enPlan = await planActivoDeGuia(g.despacho_cab_id);
    if (enPlan) return { ok: false, status: 409, mensaje: `La guía ${g.guia} ya está en el plan ${enPlan}.` };
  }

  const { data: posiciones, error: errorPos } = await supabaseAdmin
    .from("ph_posiciones")
    .select("posicion, despacho_cab_id")
    .in("despacho_cab_id", ids);
  if (errorPos) throw new Error(`Supabase (ph_posiciones): ${errorPos.message}`);
  const conPosicion = new Set((posiciones || []).map((p) => p.despacho_cab_id));
  const sinUbicar = lista.find((g) => !conPosicion.has(g.despacho_cab_id));
  if (sinUbicar) {
    return { ok: false, status: 409, mensaje: `La guía ${sinUbicar.guia} todavía no está ubicada en ninguna posición.` };
  }

  const clienteCodigo = lista[0].cliente_codigo ?? "";
  const clienteNombre = lista[0].cliente_nombre ?? null;
  const base = `PH-${slugCliente(clienteNombre, clienteCodigo)}`;

  // Los códigos no se reutilizan: se cuentan todos los planes del cliente, aun
  // los cerrados o cancelados. Si dos usuarios compiten, el UNIQUE obliga a reintentar.
  let plan: { id: number; codigo: string } | null = null;
  for (let intento = 0; intento < 5 && !plan; intento++) {
    const { data: existentes, error: errorExist } = await supabaseAdmin
      .from("ph_planes")
      .select("codigo")
      .like("codigo", `${base}%`);
    if (errorExist) throw new Error(`Supabase (ph_planes): ${errorExist.message}`);
    const usados = new Set((existentes || []).map((p) => p.codigo as string));
    let codigo = base;
    for (let n = 2; usados.has(codigo); n++) codigo = `${base}-${n}`;

    const { data: creado, error: errorPlan } = await supabaseAdmin
      .from("ph_planes")
      .insert({ codigo, cliente_codigo: clienteCodigo, cliente_nombre: clienteNombre, creado_por: params.userId })
      .select("id, codigo")
      .single();
    if (errorPlan) {
      if (errorPlan.code === "23505") continue;
      throw new Error(`Supabase (ph_planes): ${errorPlan.message}`);
    }
    plan = creado as { id: number; codigo: string };
  }
  if (!plan) return { ok: false, status: 409, mensaje: "No se pudo generar un código de plan único. Probá de nuevo." };
  const planId = plan.id;

  const ordenadas = [...(posiciones || [])].sort((a, b) => a.posicion.localeCompare(b.posicion));
  const { error: errorGuiasPlan } = await supabaseAdmin
    .from("ph_plan_guias")
    .insert(ids.map((id) => ({ plan_id: planId, despacho_cab_id: id })));
  const { error: errorPosPlan } = errorGuiasPlan
    ? { error: errorGuiasPlan }
    : await supabaseAdmin.from("ph_plan_posiciones").insert(
        ordenadas.map((p, i) => ({
          plan_id: planId,
          despacho_cab_id: p.despacho_cab_id,
          posicion: p.posicion,
          orden: i + 1,
        }))
      );
  if (errorPosPlan) {
    await supabaseAdmin.from("ph_planes").delete().eq("id", planId); // cascada
    throw new Error(`Supabase (plan ${plan.codigo}): ${errorPosPlan.message}`);
  }

  await registrarEvento({
    tipo: "crear_plan",
    planCodigo: plan.codigo,
    resultado: "ok",
    mensaje: `${ids.length} guía(s), ${ordenadas.length} posición(es).`,
    usuarioId: params.userId,
  });
  return { ok: true, planId, codigo: plan.codigo, guias: ids.length, posiciones: ordenadas.length };
}

/** Cancela un plan activo. Las posiciones de las guías quedan ocupadas como estaban. */
export async function cancelarPlan(params: { planId: number; userId: string }): Promise<ResultadoLiberar> {
  const { data: plan, error } = await supabaseAdmin
    .from("ph_planes")
    .select("id, codigo, estado")
    .eq("id", params.planId)
    .maybeSingle();
  if (error) throw new Error(`Supabase (ph_planes): ${error.message}`);
  if (!plan) return { ok: false, status: 404, mensaje: "El plan no existe." };
  if (plan.estado !== "pendiente" && plan.estado !== "en_curso") {
    return { ok: false, status: 409, mensaje: `El plan ${plan.codigo} ya está ${plan.estado}.` };
  }
  const { error: errorUpdate } = await supabaseAdmin
    .from("ph_planes")
    .update({ estado: "cancelado", cerrado_en: new Date().toISOString() })
    .eq("id", plan.id);
  if (errorUpdate) throw new Error(`Supabase (ph_planes): ${errorUpdate.message}`);
  await registrarEvento({ tipo: "cancelar_plan", planCodigo: plan.codigo, resultado: "ok", usuarioId: params.userId });
  return { ok: true };
}

/**
 * Si todas las posiciones del plan están cumplidas, lo cierra: las guías pasan
 * a "retirada" (el despacho final sigue en el WMS) y sus posiciones se liberan.
 * Devuelve true si cerró el plan.
 */
async function cerrarPlanSiCompleto(plan: { id: number; codigo: string }, userId: string | null): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("ph_plan_posiciones")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("ok", false);
  if (error) throw new Error(`Supabase (ph_plan_posiciones): ${error.message}`);
  if ((count ?? 0) > 0) return false;

  const { data: cerrado, error: errorCierre } = await supabaseAdmin
    .from("ph_planes")
    .update({ estado: "completo", cerrado_en: new Date().toISOString() })
    .eq("id", plan.id)
    .in("estado", ["pendiente", "en_curso"])
    .select("id");
  if (errorCierre) throw new Error(`Supabase (ph_planes): ${errorCierre.message}`);
  if (!cerrado || cerrado.length === 0) return false; // otro escaneo ya lo cerró

  const { data: planGuias, error: errorPG } = await supabaseAdmin
    .from("ph_plan_guias")
    .select("despacho_cab_id")
    .eq("plan_id", plan.id);
  if (errorPG) throw new Error(`Supabase (ph_plan_guias): ${errorPG.message}`);
  const ids = (planGuias || []).map((g) => g.despacho_cab_id as number);

  if (ids.length > 0) {
    await supabaseAdmin
      .from("ph_guias")
      .update({ estado: "retirada", actualizada_en: new Date().toISOString() })
      .in("despacho_cab_id", ids)
      .eq("estado", "pendiente");
    await supabaseAdmin.from("ph_posiciones").delete().in("despacho_cab_id", ids);
  }
  await registrarEvento({
    tipo: "plan_completo",
    planCodigo: plan.codigo,
    resultado: "ok",
    mensaje: "Plan completo: guías retiradas y posiciones liberadas.",
    usuarioId: userId,
  });
  return true;
}

export type CodigoErrorRecoger =
  | "plan_no_activo"
  | "posicion_no_en_plan"
  | "posicion_ya_recogida"
  | "contenedor_otra_guia";

export type ResultadoRecoger =
  | { ok: true; posicion: string; guia: string | null; pendientes: number; planCompleto: boolean }
  | { ok: false; status: number; codigo: CodigoErrorRecoger; mensaje: string };

/**
 * Operario en el handheld: escaneó una posición y un contenedor cualquiera de la
 * guía que está ahí. Si el contenedor pertenece a esa guía, la posición cuenta
 * como recogida; al cumplir todas, el plan se cierra solo.
 */
export async function recogerPosicion(params: {
  planId: number;
  posicion: string;
  contenedor: string;
  userId: string;
}): Promise<ResultadoRecoger> {
  const posicion = normalizarPosicion(params.posicion);
  const contenedor = normalizarContenedor(params.contenedor);

  const { data: plan, error: errorPlan } = await supabaseAdmin
    .from("ph_planes")
    .select("id, codigo, estado")
    .eq("id", params.planId)
    .maybeSingle();
  if (errorPlan) throw new Error(`Supabase (ph_planes): ${errorPlan.message}`);

  const fallo = async (
    codigo: CodigoErrorRecoger,
    mensaje: string,
    status: number,
    guia: string | null = null
  ): Promise<ResultadoRecoger> => {
    await registrarEvento({
      tipo: "recoger_posicion",
      contenedor,
      guia,
      posicion,
      planCodigo: plan?.codigo ?? null,
      resultado: "error",
      mensaje,
      usuarioId: params.userId,
    });
    return { ok: false, status, codigo, mensaje };
  };

  if (!plan || (plan.estado !== "pendiente" && plan.estado !== "en_curso")) {
    return fallo("plan_no_activo", "Ese plan ya no está activo.", 409);
  }

  const { data: fila, error: errorFila } = await supabaseAdmin
    .from("ph_plan_posiciones")
    .select("id, ok, despacho_cab_id")
    .eq("plan_id", plan.id)
    .eq("posicion", posicion)
    .maybeSingle();
  if (errorFila) throw new Error(`Supabase (ph_plan_posiciones): ${errorFila.message}`);
  if (!fila) return fallo("posicion_no_en_plan", `${posicion} no es una posición de este plan.`, 404);

  const { data: guia } = await supabaseAdmin
    .from("ph_guias")
    .select("guia")
    .eq("despacho_cab_id", fila.despacho_cab_id)
    .maybeSingle();
  const nombreGuia = (guia?.guia as string | null) ?? null;

  if (fila.ok) return fallo("posicion_ya_recogida", `${posicion} ya se recogió.`, 409, nombreGuia);

  const { data: cont, error: errorCont } = await supabaseAdmin
    .from("ph_contenedores")
    .select("despacho_cab_id")
    .eq("contenedor", contenedor)
    .maybeSingle();
  if (errorCont) throw new Error(`Supabase (ph_contenedores): ${errorCont.message}`);
  if (!cont || cont.despacho_cab_id !== fila.despacho_cab_id) {
    return fallo(
      "contenedor_otra_guia",
      `${contenedor} no es de la guía de la posición ${posicion}${nombreGuia ? ` (${nombreGuia})` : ""}.`,
      409,
      nombreGuia
    );
  }

  const { error: errorUpdate } = await supabaseAdmin
    .from("ph_plan_posiciones")
    .update({ ok: true, ok_en: new Date().toISOString(), ok_por: params.userId, contenedor_escaneado: contenedor })
    .eq("id", fila.id)
    .eq("ok", false);
  if (errorUpdate) throw new Error(`Supabase (ph_plan_posiciones): ${errorUpdate.message}`);

  if (plan.estado === "pendiente") {
    await supabaseAdmin.from("ph_planes").update({ estado: "en_curso" }).eq("id", plan.id).eq("estado", "pendiente");
  }

  await registrarEvento({
    tipo: "recoger_posicion",
    contenedor,
    guia: nombreGuia,
    posicion,
    planCodigo: plan.codigo,
    resultado: "ok",
    usuarioId: params.userId,
  });

  const planCompleto = await cerrarPlanSiCompleto(plan, params.userId);
  const { count } = await supabaseAdmin
    .from("ph_plan_posiciones")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("ok", false);

  return { ok: true, posicion, guia: nombreGuia, pendientes: count ?? 0, planCompleto };
}

/**
 * Guías que se despacharon en el WMS mientras estaban en un plan activo: sus
 * posiciones del plan se dan por cumplidas (ya no hay nada que retirar) y, si
 * eso completa el plan, se cierra.
 */
export async function reconciliarPlanesPorGuiasDespachadas(despachoCabIds: number[]): Promise<void> {
  if (despachoCabIds.length === 0) return;
  const { data: filas, error } = await supabaseAdmin
    .from("ph_plan_posiciones")
    .select("id, plan_id, ph_planes(codigo, estado)")
    .in("despacho_cab_id", despachoCabIds)
    .eq("ok", false);
  if (error) throw new Error(`Supabase (ph_plan_posiciones): ${error.message}`);

  const planes = new Map<number, string>();
  const idsFilas: number[] = [];
  for (const f of (filas || []) as { id: number; plan_id: number; ph_planes: unknown }[]) {
    const p = (Array.isArray(f.ph_planes) ? f.ph_planes[0] : f.ph_planes) as { codigo: string; estado: string } | null;
    if (!p || (p.estado !== "pendiente" && p.estado !== "en_curso")) continue;
    idsFilas.push(f.id);
    planes.set(f.plan_id, p.codigo);
  }
  if (idsFilas.length === 0) return;

  await supabaseAdmin.from("ph_plan_posiciones").update({ ok: true, ok_en: new Date().toISOString() }).in("id", idsFilas);
  for (const [id, codigo] of planes) await cerrarPlanSiCompleto({ id, codigo }, null);
}

export interface PlanResumen {
  id: number;
  codigo: string;
  clienteNombre: string;
  estado: string;
  creadoEn: string;
  cerradoEn: string | null;
  guias: { despachoCabId: number; guia: string; contenedores: number }[];
  posiciones: { posicion: string; orden: number; ok: boolean; guia: string }[];
}

const ESTADOS_ACTIVOS = ["pendiente", "en_curso"];

/** Planes activos y, si se pide, los últimos cerrados o cancelados, con sus guías y posiciones. */
export async function fetchPlanes(opciones: { conCerrados: boolean; planId?: number }): Promise<PlanResumen[]> {
  const base = () =>
    supabaseAdmin.from("ph_planes").select("id, codigo, cliente_nombre, estado, creado_en, cerrado_en");

  let filas: { id: number; codigo: string; cliente_nombre: string | null; estado: string; creado_en: string; cerrado_en: string | null }[];
  if (opciones.planId !== undefined) {
    const { data, error } = await base().eq("id", opciones.planId);
    if (error) throw new Error(`Supabase (ph_planes): ${error.message}`);
    filas = data || [];
  } else {
    const activos = await base().in("estado", ESTADOS_ACTIVOS).order("creado_en", { ascending: false });
    if (activos.error) throw new Error(`Supabase (ph_planes): ${activos.error.message}`);
    filas = activos.data || [];
    if (opciones.conCerrados) {
      const cerrados = await base()
        .not("estado", "in", `(${ESTADOS_ACTIVOS.join(",")})`)
        .order("cerrado_en", { ascending: false })
        .limit(30);
      if (cerrados.error) throw new Error(`Supabase (ph_planes): ${cerrados.error.message}`);
      filas = [...filas, ...(cerrados.data || [])];
    }
  }

  return Promise.all(
    filas.map(async (p) => {
      const [guias, posiciones] = await Promise.all([
        supabaseAdmin
          .from("ph_plan_guias")
          .select("despacho_cab_id, ph_guias(guia, total_contenedores)")
          .eq("plan_id", p.id),
        supabaseAdmin
          .from("ph_plan_posiciones")
          .select("despacho_cab_id, posicion, orden, ok")
          .eq("plan_id", p.id)
          .order("orden", { ascending: true })
          .limit(1000),
      ]);
      if (guias.error) throw new Error(`Supabase (ph_plan_guias): ${guias.error.message}`);
      if (posiciones.error) throw new Error(`Supabase (ph_plan_posiciones): ${posiciones.error.message}`);

      const guiaPorId = new Map<number, string>();
      const listaGuias = (guias.data || []).map((g) => {
        const datos = (Array.isArray(g.ph_guias) ? g.ph_guias[0] : g.ph_guias) as
          | { guia: string | null; total_contenedores: number | null }
          | null;
        const nombre = datos?.guia ?? "";
        guiaPorId.set(g.despacho_cab_id, nombre);
        return { despachoCabId: g.despacho_cab_id, guia: nombre, contenedores: datos?.total_contenedores ?? 0 };
      });

      return {
        id: p.id,
        codigo: p.codigo,
        clienteNombre: (p.cliente_nombre ?? "SIN CLIENTE").trim(),
        estado: p.estado,
        creadoEn: p.creado_en,
        cerradoEn: p.cerrado_en,
        guias: listaGuias,
        posiciones: (posiciones.data || []).map((x) => ({
          posicion: x.posicion,
          orden: x.orden,
          ok: x.ok,
          guia: guiaPorId.get(x.despacho_cab_id) ?? "",
        })),
      };
    })
  );
}

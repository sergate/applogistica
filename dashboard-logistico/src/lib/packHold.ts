import { supabaseAdmin } from "@/lib/supabaseClient";
import { getCached } from "@/lib/queryCache";
import { fetchAlmacenLayout } from "@/lib/almacenHelpers";

// Pack and Hold solo trabaja con guías de franquicias que siguen sin despachar
// en el WMS. Se usan tanto en la importación (Agente Local) como al explicar
// la regla en pantalla.
export const TIPO_GUIA_PACK_HOLD = "FRANQUICIA";
export const ESTADO_WMS_PACK_HOLD = "DP_INICIADO";

// Los escáneres digitan el código tal cual; se normaliza para comparar sin
// distinguir mayúsculas ni espacios sobrantes.
export const normalizarPosicion = (v: string): string => v.replace(/\s+/g, "").toUpperCase();
export const normalizarContenedor = (v: string): string => v.replace(/\s+/g, "").toUpperCase();

const LAYOUT_TTL_MS = 120_000;

/** Mapa posición (ubicacion del layout, en mayúsculas) -> zona del layout, en mayúsculas. */
export async function fetchZonaPorPosicion(): Promise<Map<string, string>> {
  return getCached("pack_hold:zona_por_posicion", LAYOUT_TTL_MS, async () => {
    const layout = await fetchAlmacenLayout();
    const mapa = new Map<string, string>();
    for (const fila of layout) {
      mapa.set(normalizarPosicion(fila.ubicacion), (fila.zona || "").trim().toUpperCase());
    }
    return mapa;
  });
}

/** Zonas que el admin habilitó para Pack and Hold (en mayúsculas). Sin caché: el cambio rige al toque. */
export async function fetchZonasHabilitadas(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("ph_zonas_habilitadas").select("zona").eq("habilitada", true);
  if (error) throw new Error(`Supabase (ph_zonas_habilitadas): ${error.message}`);
  return new Set((data || []).map((z: { zona: string }) => z.zona.trim().toUpperCase()));
}

interface EventoPackHold {
  tipo: string;
  contenedor?: string | null;
  guia?: string | null;
  posicion?: string | null;
  planCodigo?: string | null;
  resultado: "ok" | "error";
  mensaje?: string | null;
  usuarioId?: string | null;
}

/** Registro de auditoría. Nunca hace fallar la operación principal. */
export async function registrarEvento(e: EventoPackHold): Promise<void> {
  try {
    await supabaseAdmin.from("ph_eventos").insert({
      tipo: e.tipo,
      contenedor: e.contenedor ?? null,
      guia: e.guia ?? null,
      posicion: e.posicion ?? null,
      plan_codigo: e.planCodigo ?? null,
      resultado: e.resultado,
      mensaje: e.mensaje ?? null,
      usuario_id: e.usuarioId ?? null,
    });
  } catch {
    // el log es secundario
  }
}

/** Plan de recogida activo (pendiente o en curso) que incluye esa guía, si hay. */
export async function planActivoDeGuia(despachoCabId: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("ph_plan_guias")
    .select("ph_planes(codigo, estado)")
    .eq("despacho_cab_id", despachoCabId);
  if (error) throw new Error(`Supabase (ph_plan_guias): ${error.message}`);

  for (const fila of (data || []) as { ph_planes: unknown }[]) {
    const plan = (Array.isArray(fila.ph_planes) ? fila.ph_planes[0] : fila.ph_planes) as
      | { codigo: string; estado: string }
      | null
      | undefined;
    if (plan && (plan.estado === "pendiente" || plan.estado === "en_curso")) return plan.codigo;
  }
  return null;
}

export type CodigoErrorRegistro =
  | "contenedor_desconocido"
  | "guia_no_pendiente"
  | "posicion_invalida"
  | "zona_no_habilitada"
  | "posicion_ocupada"
  | "guia_en_plan";

/** Código HTTP con el que se responde cada error de registro de posición. */
export function statusDeErrorRegistro(codigo: CodigoErrorRegistro): number {
  switch (codigo) {
    case "contenedor_desconocido":
      return 404;
    case "posicion_invalida":
    case "zona_no_habilitada":
      return 400;
    default:
      return 409; // posicion_ocupada, guia_en_plan, guia_no_pendiente
  }
}

export type ResultadoRegistro =
  | {
      ok: true;
      estado: "registrada" | "ya_registrada";
      posicion: string;
      guia: string | null;
      cliente: string | null;
      posiciones: number;
    }
  | { ok: false; codigo: CodigoErrorRegistro; mensaje: string };

/**
 * Registra que la guía del contenedor escaneado está en esa posición. Reglas:
 * el contenedor tiene que estar en una guía pendiente, la posición tiene que
 * existir en el layout y estar en una zona habilitada, la guía no puede estar en
 * un plan activo, y una posición solo puede tener una guía (la garantiza la PK
 * de ph_posiciones: si dos escaneos compiten, el segundo recibe 23505).
 */
export async function registrarPosicion(params: {
  contenedor: string;
  posicion: string;
  userId: string;
}): Promise<ResultadoRegistro> {
  const contenedor = normalizarContenedor(params.contenedor);
  const posicion = normalizarPosicion(params.posicion);

  const fallo = async (
    codigo: CodigoErrorRegistro,
    mensaje: string,
    guia: string | null = null
  ): Promise<ResultadoRegistro> => {
    await registrarEvento({
      tipo: "registrar_posicion",
      contenedor,
      guia,
      posicion,
      resultado: "error",
      mensaje,
      usuarioId: params.userId,
    });
    return { ok: false, codigo, mensaje };
  };

  if (!contenedor || !posicion) {
    return fallo("posicion_invalida", "Falta el contenedor o la posición.");
  }

  const { data: filaContenedor, error: errorContenedor } = await supabaseAdmin
    .from("ph_contenedores")
    .select("despacho_cab_id")
    .eq("contenedor", contenedor)
    .maybeSingle();
  if (errorContenedor) throw new Error(`Supabase (ph_contenedores): ${errorContenedor.message}`);
  if (!filaContenedor) {
    return fallo("contenedor_desconocido", `${contenedor} no pertenece a ninguna guía pendiente. Importá las guías.`);
  }

  const { data: guia, error: errorGuia } = await supabaseAdmin
    .from("ph_guias")
    .select("despacho_cab_id, guia, cliente_nombre, estado")
    .eq("despacho_cab_id", filaContenedor.despacho_cab_id)
    .maybeSingle();
  if (errorGuia) throw new Error(`Supabase (ph_guias): ${errorGuia.message}`);
  if (!guia || guia.estado !== "pendiente") {
    return fallo("guia_no_pendiente", `La guía de ${contenedor} ya no está pendiente de despacho.`, guia?.guia ?? null);
  }

  const zonaPorPosicion = await fetchZonaPorPosicion();
  const zona = zonaPorPosicion.get(posicion);
  if (zona === undefined) {
    return fallo("posicion_invalida", `${posicion} no existe en el layout del almacén.`, guia.guia);
  }
  const habilitadas = await fetchZonasHabilitadas();
  if (!habilitadas.has(zona)) {
    return fallo(
      "zona_no_habilitada",
      `${posicion} es de la zona ${zona || "SIN ZONA"}, que no está habilitada para Pack and Hold.`,
      guia.guia
    );
  }

  const planActivo = await planActivoDeGuia(guia.despacho_cab_id);
  if (planActivo) {
    return fallo(
      "guia_en_plan",
      `La guía ${guia.guia} está en el plan ${planActivo}. No se pueden registrar posiciones nuevas.`,
      guia.guia
    );
  }

  const { error: errorInsert } = await supabaseAdmin.from("ph_posiciones").insert({
    posicion,
    despacho_cab_id: guia.despacho_cab_id,
    guia: guia.guia,
    cliente_nombre: guia.cliente_nombre,
    contenedor_escaneado: contenedor,
    registrada_por: params.userId,
  });

  let estado: "registrada" | "ya_registrada" = "registrada";
  if (errorInsert) {
    if (errorInsert.code !== "23505") throw new Error(`Supabase (ph_posiciones): ${errorInsert.message}`);
    // La posición ya tenía una guía: si es la misma, no hay nada que cambiar;
    // si es otra, la posición está bloqueada para esta guía.
    const { data: existente, error: errorExistente } = await supabaseAdmin
      .from("ph_posiciones")
      .select("despacho_cab_id, guia")
      .eq("posicion", posicion)
      .maybeSingle();
    if (errorExistente) throw new Error(`Supabase (ph_posiciones): ${errorExistente.message}`);
    if (!existente || existente.despacho_cab_id !== guia.despacho_cab_id) {
      return fallo(
        "posicion_ocupada",
        `${posicion} está ocupada por la guía ${existente?.guia ?? "de otro cliente"}. Elegí otra posición.`,
        guia.guia
      );
    }
    estado = "ya_registrada";
  }

  const { count } = await supabaseAdmin
    .from("ph_posiciones")
    .select("posicion", { count: "exact", head: true })
    .eq("despacho_cab_id", guia.despacho_cab_id);

  await registrarEvento({
    tipo: estado === "registrada" ? "registrar_posicion" : "posicion_ya_registrada",
    contenedor,
    guia: guia.guia,
    posicion,
    resultado: "ok",
    usuarioId: params.userId,
  });

  return {
    ok: true,
    estado,
    posicion,
    guia: guia.guia,
    cliente: guia.cliente_nombre,
    posiciones: count ?? 1,
  };
}

export type ResultadoLiberar =
  | { ok: true }
  | { ok: false; status: number; mensaje: string };

/** Libera una posición (por un error de carga). No se puede si la guía está en un plan activo. */
export async function liberarPosicion(params: { posicion: string; userId: string }): Promise<ResultadoLiberar> {
  const posicion = normalizarPosicion(params.posicion);

  const { data: fila, error } = await supabaseAdmin
    .from("ph_posiciones")
    .select("despacho_cab_id, guia")
    .eq("posicion", posicion)
    .maybeSingle();
  if (error) throw new Error(`Supabase (ph_posiciones): ${error.message}`);
  if (!fila) return { ok: false, status: 404, mensaje: `${posicion} no está ocupada.` };

  const planActivo = await planActivoDeGuia(fila.despacho_cab_id);
  if (planActivo) {
    return {
      ok: false,
      status: 409,
      mensaje: `La guía ${fila.guia} está en el plan ${planActivo}: cancelá el plan antes de liberar sus posiciones.`,
    };
  }

  const { error: errorDelete } = await supabaseAdmin.from("ph_posiciones").delete().eq("posicion", posicion);
  if (errorDelete) throw new Error(`Supabase (ph_posiciones): ${errorDelete.message}`);

  await registrarEvento({
    tipo: "liberar_posicion",
    guia: fila.guia,
    posicion,
    resultado: "ok",
    usuarioId: params.userId,
  });
  return { ok: true };
}

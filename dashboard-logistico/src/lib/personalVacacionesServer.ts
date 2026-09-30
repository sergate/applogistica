import { supabaseAdmin } from "@/lib/supabaseClient";
import { CICLO_INICIO, semanaISO } from "@/lib/personalVacaciones";

const CICLO_INICIO_ISO = semanaISO(CICLO_INICIO);

/**
 * Devuelve el id de personal_cd_vacaciones del empleado para el ciclo
 * vigente, creándolo con valores default si todavía no existe (primera vez
 * que se toca algo de ese empleado en Vacaciones).
 */
export async function obtenerOCrearVacacionesId(dotacionId: number): Promise<number> {
  const { data: existente, error: errorSelect } = await supabaseAdmin
    .from("personal_cd_vacaciones")
    .select("id")
    .eq("dotacion_id", dotacionId)
    .eq("ciclo_inicio", CICLO_INICIO_ISO)
    .maybeSingle();
  if (errorSelect) throw new Error(`Supabase (personal_cd_vacaciones): ${errorSelect.message}`);
  if (existente) return existente.id;

  const { data: creado, error: errorInsert } = await supabaseAdmin
    .from("personal_cd_vacaciones")
    .insert({ dotacion_id: dotacionId, ciclo_inicio: CICLO_INICIO_ISO })
    .select("id")
    .single();
  if (errorInsert) throw new Error(`Supabase (personal_cd_vacaciones): ${errorInsert.message}`);
  return creado.id;
}

export { CICLO_INICIO_ISO };

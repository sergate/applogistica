import { supabaseAdmin } from "@/lib/supabaseClient";

interface RegistroAuditoria {
  usuarioId: string;
  dotacionId?: number | null;
  legajo?: string | null;
  accion: string;
  detalle: string;
}

/** Deja un registro en personal_cd_auditoria -- ver sql/personal_cd_auditoria.sql. */
export async function registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
  const { error } = await supabaseAdmin.from("personal_cd_auditoria").insert({
    usuario_id: registro.usuarioId,
    dotacion_id: registro.dotacionId ?? null,
    legajo: registro.legajo ?? null,
    accion: registro.accion,
    detalle: registro.detalle,
  });
  if (error) throw new Error(`Supabase (personal_cd_auditoria): ${error.message}`);
}

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const SECCIONES_VALIDAS = [
  "no_ecom",
  "ecom",
  "carga_inicial",
  "remanentes",
  "pd_clientes",
  "pd_propios",
] as const;
export type SeccionActualizacion = (typeof SECCIONES_VALIDAS)[number];

export function esSeccionValida(v: unknown): v is SeccionActualizacion {
  return typeof v === "string" && (SECCIONES_VALIDAS as readonly string[]).includes(v);
}

/** Identifica al usuario logueado en el navegador (cookie de sesión de Supabase). */
export async function usuarioDesdeSesion(): Promise<{ userId: string } | { error: string; status: number }> {
  const authClient = await createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return { error: "No autenticado.", status: 401 };
  return { userId: user.id };
}

/** Identifica al Agente Local a partir de su token personal (header Authorization: Bearer <token>). */
export async function usuarioDesdeTokenAgente(
  request: Request
): Promise<{ userId: string } | { error: string; status: number }> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!token) return { error: "Falta el token del Agente Local (header Authorization).", status: 401 };

  const { data, error } = await supabaseAdmin
    .from("agente_tokens")
    .select("usuario_id")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(`Supabase (agente_tokens): ${error.message}`);
  if (!data) return { error: "Token inválido o revocado.", status: 401 };

  return { userId: data.usuario_id };
}

export function esErrorAuth(v: { userId: string } | { error: string; status: number }): v is { error: string; status: number } {
  return "error" in v;
}

// Permiso (subseccion_key de src/lib/secciones.ts) que habilita el botón
// "Actualizar esta sección (WMS)" de cada sección -- mismo esquema de
// perfiles/perfil_permisos que el resto de la app.
const PERMISO_POR_SECCION: Record<SeccionActualizacion, string> = {
  no_ecom: "NOECOM-ActualizarWMS",
  ecom: "ECOM-ActualizarWMS",
  carga_inicial: "CI-ActualizarWMS",
  remanentes: "REM-ActualizarWMS",
  pd_clientes: "PD-Clientes-ActualizarWMS",
  pd_propios: "PD-Propios-ActualizarWMS",
};

/** Chequea que el usuario tenga permiso para disparar la actualización de esa sección. */
export async function tienePermisoSeccion(userId: string, seccion: SeccionActualizacion): Promise<boolean> {
  const { data: usuario } = await supabaseAdmin.from("usuarios").select("perfil_id").eq("id", userId).single();
  if (!usuario?.perfil_id) return false;

  const { data: permiso } = await supabaseAdmin
    .from("perfil_permisos")
    .select("id")
    .eq("perfil_id", usuario.perfil_id)
    .eq("subseccion_key", PERMISO_POR_SECCION[seccion])
    .maybeSingle();

  return !!permiso;
}

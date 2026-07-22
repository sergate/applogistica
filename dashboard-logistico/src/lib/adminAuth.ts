import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

interface ResultadoAutorizacion {
  autorizado: boolean;
  status: number;
  error?: string;
  userId?: string;
}

/**
 * Verifica que el usuario logueado tenga el permiso indicado (una de las
 * claves ADMIN-Perfiles / ADMIN-Usuarios / ADMIN-Accesos) antes de dejarlo
 * usar un endpoint del panel de administración.
 */
export async function requireAdminPermission(subseccionKey: string): Promise<ResultadoAutorizacion> {
  const authClient = await createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return { autorizado: false, status: 401, error: "No autenticado." };
  }

  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("perfil_id")
    .eq("id", user.id)
    .single();

  if (!usuario?.perfil_id) {
    return { autorizado: false, status: 403, error: "Tu cuenta no tiene un perfil asignado." };
  }

  const { data: permiso } = await supabaseAdmin
    .from("perfil_permisos")
    .select("id")
    .eq("perfil_id", usuario.perfil_id)
    .eq("subseccion_key", subseccionKey)
    .maybeSingle();

  if (!permiso) {
    return { autorizado: false, status: 403, error: "No tenés permiso para realizar esta acción." };
  }

  return { autorizado: true, status: 200, userId: user.id };
}

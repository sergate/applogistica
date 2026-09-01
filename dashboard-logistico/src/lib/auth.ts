import { createClient as createServerAuthClient } from "@/lib/supabase/server";

export type ResultadoAuth = { userId: string } | { error: string; status: number };

/** Identifica al usuario logueado en el navegador (cookie de sesión de Supabase). */
export async function requireAuth(): Promise<ResultadoAuth> {
  const authClient = await createServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return { error: "No autenticado.", status: 401 };
  return { userId: user.id };
}

export function esErrorAuth(v: ResultadoAuth): v is { error: string; status: number } {
  return "error" in v;
}

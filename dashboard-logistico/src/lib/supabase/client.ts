import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para el NAVEGADOR, usado solo para autenticación
// (login, logout, sesión). Usa la key pública (anon/publishable), que
// respeta RLS -- no la Service Role Key, esa nunca se expone al cliente.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de Supabase para el SERVIDOR (API routes, Server Components),
// que lee la sesión desde las cookies de la request. Usa la key pública
// (anon/publishable) -- las consultas a datos protegidos por RLS respetan
// el usuario logueado; para operaciones administrativas seguimos usando
// el cliente con Service Role Key (src/lib/supabaseClient.ts) por separado.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Se puede ignorar si se llama desde un Server Component;
            // el middleware se encarga de refrescar la sesión en ese caso.
          }
        },
      },
    }
  );
}

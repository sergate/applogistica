import { createClient } from "@supabase/supabase-js";

// Cliente de Supabase para uso EXCLUSIVO en el servidor (API routes).
// Usa la Service Role Key porque necesitamos permisos de escritura (insert/upsert)
// sin pasar por Row Level Security. NUNCA exponer esta key al cliente/browser.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Indica a las API routes si faltan las variables de entorno, para que puedan
// devolver un error JSON prolijo en vez de que la función crashee.
export const supabaseEnvOk = !!supabaseUrl && !!supabaseServiceKey;

if (!supabaseEnvOk) {
  console.warn(
    "[supabaseClient] Faltan las variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. " +
      "Configuralas en .env.local (desarrollo) o en Vercel > Settings > Environment Variables (producción)."
  );
}

// OJO: createClient() tira una excepción sincrónica si la URL es inválida/vacía,
// y esa excepción pasa ANTES de que el try/catch del handler la pueda atrapar
// (rompe el módulo entero -> la función devuelve HTML de error en vez de JSON).
// Por eso, si faltan las env vars, usamos una URL dummy válida acá, y el chequeo
// real (supabaseEnvOk) se hace explícitamente al principio de cada API route.
export const supabaseAdmin = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseServiceKey || "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

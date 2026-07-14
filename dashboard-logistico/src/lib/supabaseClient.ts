import { createClient } from "@supabase/supabase-js";

// Cliente de Supabase para uso EXCLUSIVO en el servidor (API routes).
// Usa la Service Role Key porque necesitamos permisos de escritura (insert/upsert)
// sin pasar por Row Level Security. NUNCA exponer esta key al cliente/browser.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "[supabaseClient] Faltan las variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. " +
      "Configuralas en .env.local (desarrollo) o en Vercel > Settings > Environment Variables (producción)."
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl ?? "",
  supabaseServiceKey ?? "",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

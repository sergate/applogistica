-- Archivos de Status Remanentes - Resumen que se sacaron de la vista sin
-- borrar sus filas de la tabla "remanentes" (el dato queda intacto en la
-- base, solo deja de mostrarse en Resumen hasta que alguien lo restaure).
-- "archivo" es el mismo valor que remanentes.numero.
--
-- No usa RLS: todo el acceso pasa por las API routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en `test` como en
-- producción.

create table if not exists remanentes_archivos_ocultos (
  archivo text primary key,
  usuario_id uuid,
  created_at timestamptz not null default now()
);

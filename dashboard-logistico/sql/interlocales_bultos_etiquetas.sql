-- Una fila por bulto de cada interlocal, con el N° de etiqueta que le
-- corresponde (rótulo "interlocal-XXXXX" pegado físicamente a ese bulto).
--
-- Antes solo se guardaba un numero_etiqueta por interlocal aunque
-- cantidad_bultos fuera mayor a 1 -- eso hacía que el control de bultos por
-- handheld (hoja_de_ruta_escaneos, ver src/lib/hojaDeRutaBultos.ts) solo
-- pudiera verificar 1 bulto por interlocal sin importar cuántos hubiera en
-- realidad. Con esta tabla se carga una etiqueta por bulto desde el form de
-- "Registrar Interlocal" (ver src/app/page.tsx, pestaña Expedición ->
-- Interlocales).
--
-- interlocales.numero_etiqueta se sigue completando con la primera etiqueta
-- de la lista (compatibilidad con lo que ya lo usaba como valor único).
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create table if not exists interlocales_bultos_etiquetas (
  id bigint generated always as identity primary key,
  interlocal_id bigint not null references interlocales(id) on delete cascade,
  codigo text not null unique,
  orden integer not null default 1,
  created_at timestamptz not null default now(),
  unique (interlocal_id, orden)
);

create index if not exists interlocales_bultos_etiquetas_interlocal_idx
  on interlocales_bultos_etiquetas (interlocal_id);

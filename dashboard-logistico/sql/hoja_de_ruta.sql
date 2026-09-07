-- Módulo "Hoja de Ruta": junta los interlocales pendientes y los despachos
-- del WMS de un local/día, se confirma y se imprime para que el sistema de
-- ruteo externo (ya armado, fuera de este repo) arme el recorrido de la
-- carga con esa información.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo). Requiere que "interlocales.sql" ya se haya corrido antes.

create table if not exists hojas_de_ruta (
  id bigint generated always as identity primary key,
  fecha date not null,
  local_codigo text not null,
  local_nombre text,
  transporte text,
  patente text,
  chofer text,
  estado text not null default 'borrador' check (estado in ('borrador', 'impresa', 'anulada')),
  creado_por_id uuid references usuarios(id),
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  impresa_en timestamptz,
  impresa_por_id uuid references usuarios(id),
  impresa_por_nombre text,
  anulada_en timestamptz,
  anulada_por_nombre text
);

create index if not exists hojas_de_ruta_fecha_idx on hojas_de_ruta (fecha desc);

-- Un ítem por cada interlocal o guía de despacho incluido en la hoja.
-- "referencia_id" apunta a interlocales.id (tipo 'interlocal') o a
-- despacho_guias.despacho_cab_id (tipo 'despacho') -- no hay FK cruzada
-- porque el tipo determina la tabla.
create table if not exists hoja_de_ruta_items (
  id bigint generated always as identity primary key,
  hoja_de_ruta_id bigint not null references hojas_de_ruta(id) on delete cascade,
  tipo text not null check (tipo in ('interlocal', 'despacho')),
  referencia_id bigint not null,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  unique (hoja_de_ruta_id, tipo, referencia_id)
);

create index if not exists hoja_de_ruta_items_hoja_idx on hoja_de_ruta_items (hoja_de_ruta_id, orden);

-- Enlaza cada interlocal a la hoja que lo incluyó (columna ya existía en
-- interlocales.sql sin FK porque esta tabla no existía todavía).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'interlocales_hoja_de_ruta_fk'
  ) then
    alter table interlocales
      add constraint interlocales_hoja_de_ruta_fk
      foreign key (hoja_de_ruta_id) references hojas_de_ruta(id);
  end if;
end $$;

-- Lo mismo para despacho_guias: qué hoja de ruta se llevó esta guía (si
-- ninguna, sigue disponible para incluirse en una).
alter table despacho_guias add column if not exists hoja_de_ruta_id bigint references hojas_de_ruta(id);

create index if not exists despacho_guias_hoja_de_ruta_idx on despacho_guias (hoja_de_ruta_id);

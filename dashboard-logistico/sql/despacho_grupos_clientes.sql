-- Grupos de clientes para el módulo Despacho: el administrador arma grupos
-- (por número de cliente) que después se pueden filtrar/ver en "Para
-- Imprimir" y "Para Reimprimir". Un cliente pertenece a lo sumo a UN grupo
-- -- por eso codigo_cliente es la primary key de la tabla de miembros (no
-- compuesta con grupo_id): agregarlo a un grupo nuevo lo saca del anterior.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

create table if not exists despacho_grupos_clientes (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists despacho_grupos_clientes_miembros (
  codigo_cliente text primary key,
  grupo_id bigint not null references despacho_grupos_clientes(id) on delete cascade,
  agregado_en timestamptz not null default now()
);

create index if not exists despacho_grupos_clientes_miembros_grupo_idx
  on despacho_grupos_clientes_miembros (grupo_id);

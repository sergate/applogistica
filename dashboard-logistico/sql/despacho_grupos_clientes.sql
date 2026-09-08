-- Grupos de clientes para el módulo Despacho: el administrador arma grupos
-- (por número de cliente) que después se pueden filtrar/ver en "Para
-- Imprimir" y "Para Reimprimir". Un cliente puede pertenecer a varios grupos
-- a la vez (ej. un cliente que recibe mercadería tanto los martes como los
-- jueves) -- por eso la clave de la tabla de miembros es la combinación
-- (grupo_id, codigo_cliente), no codigo_cliente solo.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción. Si esta tabla ya existía con
-- codigo_cliente como primary key simple, correr después
-- despacho_grupos_clientes_multi.sql para migrarla.

create table if not exists despacho_grupos_clientes (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists despacho_grupos_clientes_miembros (
  codigo_cliente text not null,
  grupo_id bigint not null references despacho_grupos_clientes(id) on delete cascade,
  agregado_en timestamptz not null default now(),
  primary key (grupo_id, codigo_cliente)
);

create index if not exists despacho_grupos_clientes_miembros_grupo_idx
  on despacho_grupos_clientes_miembros (grupo_id);

create index if not exists despacho_grupos_clientes_miembros_codigo_idx
  on despacho_grupos_clientes_miembros (codigo_cliente);

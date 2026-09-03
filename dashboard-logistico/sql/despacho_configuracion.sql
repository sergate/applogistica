-- Configuración general del módulo Despacho, editable por el admin desde el
-- panel "Grupos de Clientes (Admin)". Fila única (id fijo en 1).
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

create table if not exists despacho_configuracion (
  id smallint primary key default 1,
  ocultar_tipo_cliente boolean not null default false,
  actualizado_en timestamptz not null default now(),
  actualizado_por_nombre text,
  constraint despacho_configuracion_singleton check (id = 1)
);

insert into despacho_configuracion (id) values (1)
  on conflict (id) do nothing;

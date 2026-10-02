-- Artículos master registrados en Status Carga Inicial - Carga Datos, cada
-- uno con una observación (la "colección" a la que pertenece) y una fecha.
-- Status Carga Inicial - Colecciones cruza estos artículos contra la tabla
-- carga_inicial (columna sku) y agrupa los pedidos por observación.
--
-- Una misma observación agrupa varios artículos (una fila por artículo).
-- Un mismo artículo puede figurar en más de una observación.
--
-- No usa RLS: todo el acceso pasa por las API routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en `test` como en
-- producción.

create table if not exists carga_inicial_articulos_master (
  id bigint generated always as identity primary key,
  articulo text not null,
  observacion text not null,
  fecha date not null,
  usuario_id uuid,
  created_at timestamptz not null default now(),

  unique (observacion, articulo)
);

create index if not exists carga_inicial_articulos_master_observacion_idx
  on carga_inicial_articulos_master (observacion);

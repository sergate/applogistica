-- Maestro de SKU de insumos (reemplaza al enfoque por "Grupo" de
-- Existencia, ver insumos_limpieza_enfoque_grupos.sql). Cada fila acá es
-- un SKU catalogado como insumo -- se administra a mano desde Despacho ->
-- SKU de Insumos (Admin), ~112 SKU en total. Se usa para clasificar, por
-- caja del packing list de cada guía Propio, si el 100% de su contenido es
-- insumo (ver despacho_guias_packing_list.sql).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create table if not exists insumos_skus_maestro (
  sku text primary key,
  descripcion text,
  creado_en timestamptz not null default now(),
  creado_por_nombre text
);

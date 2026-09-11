-- Detalle del packing list (caja + SKU + cantidad) de cada guía de
-- despacho tipo PROPIO, para poder desglosar cuántos bultos son insumos vs
-- producto. Se llena desde el mismo pedido "despacho_importar" del Agente
-- Local: para cada guía tipo PROPIO consulta además el packing list
-- (POST despacho/packing_list, wms-reportes/reporte-despachos.js) y lo
-- guarda acá tal cual.
--
-- Se recalcula por guía en cada import: se borra el packing list de las
-- guías que vienen en el pedido y se inserta de nuevo (foto vigente por
-- guía, no acumulativo).
--
-- La columna "es_insumo" que tenía despacho_guias_bultos (del enfoque por
-- Grupo de Existencia, ya descartado) se saca porque nunca se calculó bien
-- -- el desglose insumo/producto ahora se calcula directo desde esta tabla
-- cruzando "sku" contra insumos_skus_maestro.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

alter table despacho_guias_bultos drop column if exists es_insumo;

create table if not exists despacho_guias_packing_list (
  id bigint generated always as identity primary key,
  despacho_cab_id bigint not null references despacho_guias(despacho_cab_id) on delete cascade,
  caja text not null,
  sku text not null,
  cantidad numeric,
  created_at timestamptz not null default now()
);

create index if not exists despacho_guias_packing_list_cab_idx
  on despacho_guias_packing_list (despacho_cab_id);

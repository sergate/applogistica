-- Detalle de bultos (contenedor/caja) por guía de despacho, para poder
-- desglosar cuántos bultos de cada guía son insumos vs producto. Se llena
-- desde el mismo pedido "despacho_importar" del Agente Local, que ya trae
-- las guías del día -- para cada una consulta además el detalle
-- (despacho/{id}/find_by_det, wms-reportes/reporte-despachos.js) y clasifica
-- cada "caja" contra existencia_contenedores_insumo.
--
-- Se recalcula por guía en cada import: se borran los bultos de las guías
-- que vienen en el pedido y se insertan de nuevo (foto vigente por guía,
-- no acumulativo).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

alter table despacho_guias add column if not exists bultos_insumos integer;
alter table despacho_guias add column if not exists bultos_producto integer;

create table if not exists despacho_guias_bultos (
  id bigint generated always as identity primary key,
  despacho_cab_id bigint not null references despacho_guias(despacho_cab_id) on delete cascade,
  caja text not null,
  remito text,
  cantidad numeric,
  es_insumo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists despacho_guias_bultos_cab_idx
  on despacho_guias_bultos (despacho_cab_id);

-- Tabla nueva para la sección "Ecom" dentro de Status de Preparación.
-- A diferencia de grupo_pedidos/tiendas_destino (una fila por línea de grupo
-- dentro de un pedido), acá el archivo origen trae UNA fila por pedido de
-- e-commerce, con columnas propias (Sector/Piso en vez de Grupo, y "OOLL
-- asignado" como canal real en vez de cruzar tiendas_destino/clientes).
--
-- Se importa en modo "full_replace" (igual que grupo_pedidos/tiendas_destino
-- vía /api/import-maestros): cada carga borra la tabla entera y vuelve a
-- insertar, así que no hace falta ninguna PK ni constraint de unicidad.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create table if not exists pedidos_ecom (
  id bigint generated always as identity primary key,
  tipo text,
  canal text,
  tracking_pedido text,
  pedido text,
  nombre_pedido text,
  piso text,
  sector text,
  sectores text,
  uni numeric,
  uni_plan numeric,
  uni_pick numeric,
  uni_sep numeric,
  uni_pend numeric,
  uni_nc numeric,
  seller text,
  estado_pedido text,
  cancelado text,
  sd text,
  tienda_destino text,
  fecha_creacion text,
  tracking_paquete text,
  estado_paquete text,
  ooll_asignado text,
  patente_dist text,
  sucursal text,
  created_at timestamptz not null default now()
);

create index if not exists pedidos_ecom_pedido_idx on pedidos_ecom (pedido);
create index if not exists pedidos_ecom_seller_idx on pedidos_ecom (seller);

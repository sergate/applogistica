-- Progreso real del pedido de actualización (Agente Local), para mostrar
-- una barra de progreso al lado del botón "Actualizar esta sección (WMS)"
-- en vez de solo "Actualizando...".
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

alter table actualizaciones_wms add column if not exists progreso smallint not null default 0;
alter table actualizaciones_wms add column if not exists paso text;

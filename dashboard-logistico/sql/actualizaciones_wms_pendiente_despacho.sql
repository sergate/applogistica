-- Agrega "pd_clientes" y "pd_propios" a las secciones válidas de
-- actualizaciones_wms (automatización WMS de Pendiente de Despacho -
-- Clientes y Propios). Correr manualmente en el SQL editor de Supabase,
-- tanto en el proyecto `test` como en el de producción.

alter table actualizaciones_wms
  drop constraint if exists actualizaciones_wms_seccion_check;

alter table actualizaciones_wms
  add constraint actualizaciones_wms_seccion_check
  check (seccion in ('no_ecom', 'ecom', 'carga_inicial', 'remanentes', 'pd_clientes', 'pd_propios'));

-- Agrega "despacho_importar", "despacho_imprimir" y "despacho_reimprimir" a
-- las secciones válidas de actualizaciones_wms (módulo Despacho: importar
-- guías del WMS, imprimir guía+remito en tanda, y reimprimir), más una
-- columna "payload" para llevar la lista de guías seleccionadas en un
-- pedido de impresión/reimpresión (los pedidos de importación no la usan).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table actualizaciones_wms add column if not exists payload jsonb;

alter table actualizaciones_wms
  drop constraint if exists actualizaciones_wms_seccion_check;

alter table actualizaciones_wms
  add constraint actualizaciones_wms_seccion_check
  check (seccion in ('no_ecom', 'ecom', 'carga_inicial', 'remanentes', 'pd_clientes', 'pd_propios',
                      'ocupacion_almacen', 'despacho_importar', 'despacho_imprimir', 'despacho_reimprimir'));

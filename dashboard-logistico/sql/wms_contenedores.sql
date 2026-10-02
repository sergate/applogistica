-- Mapeo contenedor -> marca para Pendiente de Despacho (Clientes y Propios).
-- Lo carga el Agente Local desde WMS -> Contenedores (Tipo = CI, "CSV Completo").
-- Es un upsert por contenedor (nunca se borra): un contenedor ya creado no
-- cambia de marca, así que el mapeo se va acumulando.
--
-- También agrega "contenedores_wms" a las secciones válidas de
-- actualizaciones_wms (botón "Actualizar contenedores desde WMS").
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

create table if not exists wms_contenedores (
  contenedor text primary key,
  marca text,
  temporada text,
  updated_at timestamptz not null default now()
);

alter table actualizaciones_wms
  drop constraint if exists actualizaciones_wms_seccion_check;

alter table actualizaciones_wms
  add constraint actualizaciones_wms_seccion_check
  check (seccion in ('no_ecom', 'ecom', 'carga_inicial', 'remanentes', 'pd_clientes', 'pd_propios',
                      'ocupacion_almacen', 'productividad', 'despacho_importar', 'despacho_imprimir',
                      'despacho_reimprimir', 'exp_etiquetas', 'contenedores_wms'));

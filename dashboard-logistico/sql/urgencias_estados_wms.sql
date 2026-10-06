-- Seguimiento Urgencias: estado real de cada contenedor en el WMS (para saber si
-- ya fue despachado: PA_CARGA_CAMION / PA_DESPACHADO).
--
-- El Agente Local consulta el estado de cada contenedor cargado en los bloques y
-- lo guarda acá. "NO ENCONTRADO" = el WMS no devolvió ese número de contenedor.
--
-- También agrega "urgencias_estados_wms" a las secciones válidas de
-- actualizaciones_wms (botón "Actualizar estados desde WMS").
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table urgencias_contenedores add column if not exists estado_wms text;
alter table urgencias_contenedores add column if not exists estado_wms_en timestamptz;

alter table actualizaciones_wms
  drop constraint if exists actualizaciones_wms_seccion_check;

alter table actualizaciones_wms
  add constraint actualizaciones_wms_seccion_check
  check (seccion in ('no_ecom', 'ecom', 'carga_inicial', 'remanentes', 'pd_clientes', 'pd_propios',
                      'ocupacion_almacen', 'productividad', 'despacho_importar', 'despacho_imprimir',
                      'despacho_reimprimir', 'exp_etiquetas', 'contenedores_wms', 'urgencias_estados_wms'));

-- Nuevo tipo de envío "Control de Calidad" en el dropdown "¿Qué se va a
-- enviar?" de Registrar Interlocal -- se carga a mano igual que "productos"
-- (N° de Movimiento y N° de Remito manuales), pero con su propia
-- nomenclatura: no comparte la secuencia numérica de productos/varios (ver
-- interlocales_numero_movimiento_compartido.sql).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

alter table interlocales drop constraint if exists interlocales_tipo_envio_check;

alter table interlocales
  add constraint interlocales_tipo_envio_check
  check (tipo_envio in ('productos', 'varios', 'control_calidad'));

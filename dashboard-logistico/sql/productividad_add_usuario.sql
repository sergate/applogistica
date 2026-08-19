-- Agrega la columna "usuario" a la tabla productividad, para poder contar
-- usuarios únicos por tipo de proceso y fecha en Producción por Proceso ->
-- Resumen. El archivo Excel que se importa ya trae esta columna ("Usuario").
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

alter table productividad add column if not exists usuario text;

-- Agrega la columna "grupo" a la tabla productividad, para poder diferenciar
-- a qué grupo del WMS (A, C, etc.) corresponde cada fila. Hasta ahora el
-- reporte de Productividad solo se descargaba con el Grupo A tildado; ahora
-- también se descarga el Grupo C, y el Excel trae una columna "Grupo" que
-- se inserta acá tal cual (ver reporteProductividad en wms-reportes/descargar-reportes.js).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

alter table productividad add column if not exists grupo text;

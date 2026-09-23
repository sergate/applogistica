-- Marca los eventos de escaneo que se insertaron recién al finalizar la
-- sesión (porque el POST individual /evento falló en su momento -- típico
-- de wifi débil en el depósito -- y el handheld lo reconcilió contra su
-- lista local al cerrar) en vez de haberse guardado en tiempo real durante
-- el escaneo. No cambia el filtro de "escaneado" del Histórico (sigue
-- siendo resultado='ok_nuevo'), solo agrega una marca para poder
-- diferenciarlos si hace falta auditar más adelante.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

alter table hoja_de_ruta_escaneo_eventos add column if not exists reconciliado boolean not null default false;

-- Campos arba_request / arba_response del WMS (Despacho) -- se van a usar
-- para determinar si una guía ya fue despachada o sigue en el depósito.
-- Nombres crudos tal cual los devuelve el WMS (mapeo exacto a "ARBA
-- archivo"/"ARBA comprobante" todavía por confirmar).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table despacho_guias add column if not exists arba_request text;
alter table despacho_guias add column if not exists arba_response text;

-- Corrección: arba_request/arba_response (agregados antes) resultaron estar
-- siempre en null incluso en guías ya despachadas -- no sirven para
-- determinar el estado. Confirmado contra 277 guías reales con estado
-- DP_COT_OK: lo que realmente indica que una guía fue despachada es
-- numero_comprobante + nombre_archivo (el .txt que se manda a ARBA, ej.
-- "TB_30677291083_001001_20260907_074544.txt"). numero_comprobante ya se
-- guardaba desde el principio -- acá solo se agrega nombre_archivo y se
-- sacan las dos columnas que no servían.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table despacho_guias drop column if exists arba_request;
alter table despacho_guias drop column if exists arba_response;
alter table despacho_guias add column if not exists nombre_archivo text;

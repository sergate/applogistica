-- Limpieza del enfoque de clasificación de insumos por "Grupo" del archivo
-- de Existencia (descartado: los contenedores de Existencia usan un
-- identificador distinto al "caja" de Despacho -- prefijos PT vs DP/PA --
-- así que nunca cruzaban). Reemplazado por el maestro de SKU de insumos +
-- packing list por guía (ver insumos_skus_maestro.sql y
-- despacho_guias_packing_list.sql).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción, cuando quieras (no es urgente -- estas
-- tablas quedan simplemente sin uso hasta que las borres).

drop table if exists existencia_contenedores_insumo;
drop table if exists insumos_grupos_maestro;

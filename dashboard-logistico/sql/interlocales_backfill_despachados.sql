-- Backfill único: las Hojas de Ruta que ya estaban impresas ANTES de que se
-- agregara la transición automática a "despachado" (ver
-- api/hoja-ruta/[id]/imprimir/route.ts) se quedaron con sus interlocales en
-- "en_hoja_de_ruta". Este script las pone al día para que también aparezcan
-- en Expedición > Histórico Despachados.
--
-- Correr una sola vez en el SQL editor de Supabase, tanto en `test` como en
-- producción. Es seguro re-ejecutarlo (no afecta filas que ya estén en otro
-- estado).

update interlocales
set estado = 'despachado'
where estado = 'en_hoja_de_ruta'
  and hoja_de_ruta_id in (select id from hojas_de_ruta where estado = 'impresa');

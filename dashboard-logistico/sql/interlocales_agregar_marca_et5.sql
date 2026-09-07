-- Agrega "ET5 - Estudio 5" como marca válida en Interlocales.
-- interlocales.sql ya se corrió antes en ambos ambientes (test y
-- producción) con el constraint viejo (CHEEKY / COMO QUIERES / AWADA), así
-- que hace falta esta migración chica para no tener que recrear la tabla.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en `test` como en
-- producción.

alter table interlocales drop constraint if exists interlocales_marca_check;

alter table interlocales
  add constraint interlocales_marca_check
  check (marca in ('CHEEKY', 'COMO QUIERES', 'AWADA', 'ESTUDIO 5'));

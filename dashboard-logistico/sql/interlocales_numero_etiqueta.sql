-- "N° Etiqueta": un número que se carga a mano en el interlocal y que más
-- adelante se usa en otros circuitos como si fuera el número de guía del
-- WMS (para interlocales que todavía no tienen una guía real asociada).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table interlocales add column if not exists numero_etiqueta text unique;

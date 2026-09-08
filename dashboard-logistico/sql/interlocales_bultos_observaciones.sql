-- "cantidad_bultos" ya existía (default 1) pero nunca se usó -- se asumía
-- siempre 1 bulto por interlocal. Ahora pasa a ser un campo editable del
-- formulario. "observaciones" es nueva, para anotar qué va dentro del
-- bulto -- se muestra también en la Hoja de Ruta impresa.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table interlocales add column if not exists observaciones text;

-- Seguimiento Urgencias: los contenedores se organizan en BLOQUES con nombre y
-- fecha (mismo formato que las colecciones de Carga Inicial).
--
-- Los contenedores ya cargados pasan a un bloque con el nombre de su "nota"
-- (o "Sin bloque" si no tenían) y con la fecha en que se cargaron.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table urgencias_contenedores add column if not exists bloque text;
alter table urgencias_contenedores add column if not exists fecha date;

update urgencias_contenedores
set bloque = coalesce(nullif(trim(nota), ''), 'Sin bloque')
where bloque is null;

update urgencias_contenedores
set fecha = (created_at at time zone 'America/Argentina/Buenos_Aires')::date
where fecha is null;

-- Limpieza puntual: saca de "clientes" los que ya estén cargados con
-- estado "Borrado" (de acá en más el import de Clientes los excluye solo,
-- ver Importar.tsx -- pero el import es upsert por código, no borra los
-- que ya estaban, así que esto hace falta una sola vez).
--
-- Corré primero el SELECT para confirmar cuántos hay antes de borrar.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

select codigo, nombre, estado
from clientes
where trim(lower(estado)) = 'borrado';

-- Descomentar y correr después de confirmar el resultado del SELECT:
-- delete from clientes
-- where trim(lower(estado)) = 'borrado';

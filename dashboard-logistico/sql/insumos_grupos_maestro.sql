-- Maestro de qué "Grupo" del archivo de Existencia corresponde a insumos
-- (no producto) -- se usa para clasificar contenedores 100% insumo al
-- importar Existencia (mismo import de Ocupación Almacén) y así poder
-- desglosar, guía por guía, cuántos bultos son insumos vs producto.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create table if not exists insumos_grupos_maestro (
  grupo text primary key,
  es_insumo boolean not null default false,
  actualizado_en timestamptz not null default now(),
  actualizado_por_nombre text
);

-- Precarga los grupos reales vistos en el archivo de Existencia (a la fecha
-- de este análisis) para que la futura pantalla de administración ya
-- arranque con la lista completa -- PACKAGING y MATERIALES EMPAQUE
-- marcados como insumo, el resto queda en false y se puede tildar
-- manualmente si hace falta. Un grupo nuevo que aparezca en un import
-- futuro y no esté en esta lista queda excluido de la clasificación de
-- insumo hasta que se agregue acá.
insert into insumos_grupos_maestro (grupo, es_insumo) values
  ('ABRIGOS', false),
  ('ACCESORIOS', false),
  ('BODYS', false),
  ('BUZOS', false),
  ('CAMISAS', false),
  ('CAMPERAS', false),
  ('DECO', false),
  ('ENTERITOS', false),
  ('MANTELERIA', false),
  ('MATERIALES EMPAQUE', true),
  ('PACKAGING', true),
  ('PANTALONES', false),
  ('POLLERAS', false),
  ('PROMOCION', false),
  ('REMERAS', false),
  ('SASTRERIA', false),
  ('SHOES', false),
  ('SWEATERS', false),
  ('TEJIDOS', false),
  ('TRAJES DE BANO', false),
  ('UNDERWEAR', false),
  ('VAJILLA', false),
  ('VESTIDOS Y MONOS', false),
  ('VESTIDOS Y POLLERAS', false),
  ('VIDRIERA', false)
on conflict (grupo) do nothing;

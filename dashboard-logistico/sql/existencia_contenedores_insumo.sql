-- Snapshot de qué contenedores del archivo de Existencia son 100% insumo
-- (todas sus filas caen en un Grupo marcado como insumo en
-- insumos_grupos_maestro). Se recalcula entero en cada importación de
-- Existencia (foto completa y vigente, igual que almacen_ocupacion): se
-- borra todo y se inserta de nuevo. Solo se guardan los contenedores
-- insumo -- un contenedor que no aparece acá se asume "producto".
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create table if not exists existencia_contenedores_insumo (
  contenedor text primary key,
  actualizado_en timestamptz not null default now()
);

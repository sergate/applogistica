-- Personal CD: lista maestra de PUESTOS, que se mantiene desde Sectores (solo
-- Administrador, permiso PCD-Sectores) y alimenta el campo "Puesto" de Dotación,
-- igual que ya pasa con la lista de sectores.
--
-- En Dotación el puesto de cada empleado sigue guardándose como texto
-- (personal_cd_dotacion.puesto): esta tabla solo define qué puestos se pueden
-- elegir. Renombrar un puesto desde Sectores actualiza también a los empleados
-- que lo tienen, y no se puede borrar un puesto que tenga empleados.
--
-- No hace falta cargarla a mano: en Sectores aparece la lista de puestos que ya
-- están en uso en Dotación y todavía no se crearon, con un botón para crearlos.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API routes
-- con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto `test`
-- como en el de producción. Es seguro correrlo más de una vez.

create table if not exists personal_cd_puestos (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- "Operario" y "operario" son el mismo puesto: el nombre es único sin distinguir
-- mayúsculas ni espacios de más.
create unique index if not exists personal_cd_puestos_nombre_ci_idx
  on personal_cd_puestos (lower(btrim(nombre)));

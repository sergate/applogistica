-- Personal CD > Cupos Vacaciones: cupo de personas que pueden estar de vacaciones
-- por puesto y por semana, y tarjetas de comparación con nombre.
--
-- * personal_cd_cupos_vacaciones: un cupo por puesto (lista maestra de puestos, se
--   mantiene en Sectores) y por semana (el LUNES de la semana, igual que
--   personal_cd_vacaciones_cargas.semana_inicio). Un cupo en blanco o en 0 se
--   guarda como ausencia de fila ("sin cupo asignado").
-- * personal_cd_cupos_tarjetas: las tarjetas de comparación. Son únicas para todos
--   los usuarios; quién puede armarlas lo define el permiso PCD-CuposComparar. Cada
--   tarjeta guarda los puestos que compara por identificador, así sigue al puesto
--   aunque se lo renombre en Sectores.
--
-- El "usado" de cada semana NO se guarda: se calcula desde las vacaciones cargadas
-- (personal_cd_vacaciones_cargas) y el puesto de cada empleado en Dotación.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API routes con la
-- Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto `test` como en
-- el de producción. Es seguro correrlo más de una vez. Requiere que ya exista
-- personal_cd_puestos (sql/personal_cd_puestos.sql).

create table if not exists personal_cd_cupos_vacaciones (
  id bigint generated always as identity primary key,
  puesto_id bigint not null references personal_cd_puestos(id) on delete cascade,
  semana_inicio date not null,
  cupo integer not null check (cupo > 0),
  actualizado_por uuid references usuarios(id),
  actualizado_en timestamptz not null default now(),
  unique (puesto_id, semana_inicio)
);

create index if not exists personal_cd_cupos_vacaciones_semana_idx
  on personal_cd_cupos_vacaciones (semana_inicio);

create table if not exists personal_cd_cupos_tarjetas (
  id bigint generated always as identity primary key,
  nombre text not null,
  puestos_ids bigint[] not null default '{}',
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- El nombre de una tarjeta es único sin distinguir mayúsculas ni espacios de más.
create unique index if not exists personal_cd_cupos_tarjetas_nombre_ci_idx
  on personal_cd_cupos_tarjetas (lower(btrim(nombre)));

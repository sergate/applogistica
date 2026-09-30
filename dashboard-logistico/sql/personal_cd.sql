-- Módulo "Personal CD": Dotación, Vacaciones y Sectores (Admin) del Centro
-- de Distribución. Sectores es la lista maestra que alimenta el campo
-- "Sector" de Dotación -- se mantiene desde su propio submódulo, solo
-- visible para el perfil Administrador (mismo mecanismo de permisos que el
-- resto de la app, vía perfil_permisos + subseccion_key "PCD-Sectores").
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create table if not exists personal_cd_sectores (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists personal_cd_dotacion (
  id bigint generated always as identity primary key,

  legajo text not null unique,
  apellido_nombre text not null,
  dni text,
  fecha_nacimiento date,
  fecha_ingreso date not null,

  sector_id bigint references personal_cd_sectores(id),
  puesto text,
  turno text check (turno in ('Mañana', 'Tarde', 'Noche', 'Rotativo')),
  tipo_contrato text check (tipo_contrato in ('Efectivo', 'Eventual', 'Pasantía')),
  estado text not null default 'Activo' check (estado in ('Activo', 'Licencia', 'Baja')),

  telefono text,
  email text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_cd_dotacion_sector_idx on personal_cd_dotacion (sector_id);

-- Un registro por empleado y por ciclo de vacaciones (el ciclo actual
-- arranca 2026-10-01 y corre hasta noviembre del año siguiente -- ver
-- inicioCicloVigente() en src/lib/personalVacaciones.ts). vacaciones_actuales
-- se calcula por antigüedad al arrancar el ciclo; vacaciones_actuales_manual
-- permite pisarlo a mano (NULL = usar el cálculo automático).
create table if not exists personal_cd_vacaciones (
  id bigint generated always as identity primary key,
  dotacion_id bigint not null references personal_cd_dotacion(id) on delete cascade,
  ciclo_inicio date not null,

  vacaciones_adeudadas numeric not null default 0,
  vacaciones_actuales_manual numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (dotacion_id, ciclo_inicio)
);

-- Días cargados en una semana puntual del ciclo -- el saldo se calcula
-- restando la suma de todas estas filas (de todo el ciclo, no solo del
-- trimestre que se esté mirando) al total de adeudadas + actuales.
create table if not exists personal_cd_vacaciones_cargas (
  id bigint generated always as identity primary key,
  vacaciones_id bigint not null references personal_cd_vacaciones(id) on delete cascade,
  semana_inicio date not null,
  dias numeric not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (vacaciones_id, semana_inicio)
);

create index if not exists personal_cd_vacaciones_cargas_vacaciones_idx
  on personal_cd_vacaciones_cargas (vacaciones_id);

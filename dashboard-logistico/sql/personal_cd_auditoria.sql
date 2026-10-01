-- Registro de auditoría para Personal CD: quién editó Vacaciones (adeudadas,
-- actuales manual, carga de una semana) o dio de alta/cambió el estado de un
-- empleado en Dotación. Solo visible para el admin (submódulo
-- "PCD-Auditoria", mismo mecanismo de permisos que el resto de la app).
--
-- No usa RLS: todo el acceso pasa por las API routes con la Service Role Key.
-- usuario_id no tiene FK a auth.users a propósito (igual que el resto de la
-- app resuelve usuarios vía la tabla "usuarios", no vía auth.users
-- directamente) -- se resuelve a email/nombre al leer, cruzando contra
-- "usuarios" en la API route.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en `test` como en
-- producción.

create table if not exists personal_cd_auditoria (
  id bigint generated always as identity primary key,

  usuario_id uuid not null,
  dotacion_id bigint references personal_cd_dotacion(id) on delete set null,
  legajo text,

  accion text not null,
  detalle text not null,

  created_at timestamptz not null default now()
);

create index if not exists personal_cd_auditoria_dotacion_idx on personal_cd_auditoria (dotacion_id);
create index if not exists personal_cd_auditoria_created_idx on personal_cd_auditoria (created_at desc);

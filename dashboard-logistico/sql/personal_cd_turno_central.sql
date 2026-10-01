-- El turno "Rotativo" de Dotación se renombró a "Central" en el frontend
-- (src/components/sections/personalCd/Dotacion.tsx) pero el CHECK de la
-- columna turno en personal_cd_dotacion seguía validando 'Rotativo' --
-- cualquier alta/edición/import con turno "Central" fallaba en el insert.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en `test` como en
-- producción.

alter table personal_cd_dotacion drop constraint if exists personal_cd_dotacion_turno_check;

alter table personal_cd_dotacion
  add constraint personal_cd_dotacion_turno_check
  check (turno in ('Mañana', 'Tarde', 'Noche', 'Central'));

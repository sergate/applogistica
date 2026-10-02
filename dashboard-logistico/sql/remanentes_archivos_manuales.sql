-- Nombres de archivos de Status Remanentes cargados a mano (Carga Datos),
-- al estilo de pedidos_rema_manual en Status de Preparación:
--   1) el Agente Local los busca en el combo "Pedido" de Resumen CI del WMS
--      y los descarga junto con los REMA de siempre al actualizar Remanentes;
--   2) Resumen y Avance Plan los cuentan como remanentes aunque su nombre no
--      lleve la palabra REMA.
-- "archivo" es el mismo texto que remanentes.numero / el nombre del combo.
--
-- No usa RLS: todo el acceso pasa por las API routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en `test` como en
-- producción.

create table if not exists remanentes_archivos_manuales (
  id bigint generated always as identity primary key,
  archivo text not null unique,
  nota text,
  usuario_id uuid,
  created_at timestamptz not null default now()
);

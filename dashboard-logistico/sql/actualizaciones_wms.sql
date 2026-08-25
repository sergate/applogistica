-- Cola de pedidos de actualización automática (WMS -> Tablero) que dispara
-- cada usuario desde el botón "Actualizar esta sección" en las pantallas de
-- Importar. El Agente Local (script que corre en la PC de cada usuario) hace
-- polling de esta tabla y ejecuta la descarga+subida correspondiente.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key (ver src/lib/supabaseClient.ts), que son
-- las que garantizan que un usuario solo vea/toque sus propios pedidos.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create table if not exists actualizaciones_wms (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references usuarios(id),
  seccion text not null check (seccion in ('no_ecom', 'ecom', 'carga_inicial', 'remanentes')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'corriendo', 'ok', 'error')),
  mensaje text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists actualizaciones_wms_usuario_estado_idx
  on actualizaciones_wms (usuario_id, estado, created_at desc);

-- Token personal del Agente Local: uno por usuario. Se genera desde el
-- Tablero ("Generar token para mi Agente Local") y se pega en la config del
-- agente en su PC -- así el agente nunca necesita la contraseña real de la
-- cuenta, y el token se puede regenerar/invalidar en cualquier momento
-- (regenerar simplemente pisa la fila, el token viejo deja de servir).
create table if not exists agente_tokens (
  usuario_id uuid primary key references usuarios(id),
  token text not null unique,
  created_at timestamptz not null default now()
);

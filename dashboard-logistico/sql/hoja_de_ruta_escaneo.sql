-- Control de bultos por Hoja de Ruta vía handheld: se escanea el código de
-- barras de la hoja (impreso ahora en el PDF, ver imprimir/page.tsx) y
-- después cada bulto (caja de despacho o etiqueta de interlocal) contra la
-- lista de "esperados" de esa hoja.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

-- Una fila por sesión de escaneo de una hoja (normalmente una, pero puede
-- haber más de una si se reintenta otro día).
create table if not exists hoja_de_ruta_escaneos (
  id bigint generated always as identity primary key,
  hoja_de_ruta_id bigint not null references hojas_de_ruta(id),
  usuario_id uuid not null references usuarios(id),
  usuario_nombre text,
  iniciado_en timestamptz not null default now(),
  finalizado_en timestamptz,
  bultos_esperados integer,
  bultos_escaneados integer,
  resultado text check (resultado in ('completo', 'incompleto'))
);

create index if not exists hoja_de_ruta_escaneos_hoja_idx
  on hoja_de_ruta_escaneos (hoja_de_ruta_id);

-- Log append-only de CADA escaneo individual dentro de una sesión --
-- auditoría completa, incluye los repetidos y los que no pertenecen a la
-- hoja (no solo los que sumaron).
create table if not exists hoja_de_ruta_escaneo_eventos (
  id bigint generated always as identity primary key,
  escaneo_id bigint not null references hoja_de_ruta_escaneos(id) on delete cascade,
  codigo text not null,
  tipo text check (tipo in ('despacho', 'interlocal')),
  resultado text not null check (resultado in ('ok_nuevo', 'ok_duplicado', 'no_pertenece')),
  escaneado_en timestamptz not null default now()
);

create index if not exists hoja_de_ruta_escaneo_eventos_escaneo_idx
  on hoja_de_ruta_escaneo_eventos (escaneo_id);

-- Bultos que quedaron sin escanear cuando una sesión se cierra incompleta
-- ("Cerrar con faltante").
create table if not exists hoja_de_ruta_bultos_faltantes (
  id bigint generated always as identity primary key,
  escaneo_id bigint not null references hoja_de_ruta_escaneos(id) on delete cascade,
  hoja_de_ruta_id bigint not null references hojas_de_ruta(id),
  codigo text not null,
  tipo text check (tipo in ('despacho', 'interlocal')),
  creado_en timestamptz not null default now()
);

create index if not exists hoja_de_ruta_bultos_faltantes_hoja_idx
  on hoja_de_ruta_bultos_faltantes (hoja_de_ruta_id);

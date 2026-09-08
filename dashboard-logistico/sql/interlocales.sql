-- Módulo "Interlocales": registro de los traslados de mercadería entre
-- locales (rótulo físico "GRUPO ALTATEX / INTERLOCAL" que va pegado a cada
-- bulto). Se carga a mano transcribiendo el rótulo, y desde acá se toman los
-- pendientes para armar la Hoja de Ruta de cada local.
--
-- Local origen y destino salen de la tabla "clientes" existente (codigo,
-- nombre) -- no hay una tabla "locales" separada.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create table if not exists interlocales (
  id bigint generated always as identity primary key,

  -- Identificadores del rótulo (N° DE MOVIMIENTO es la clave del WMS -- un
  -- rótulo = un bulto = un movimiento, así que sirve para evitar carga
  -- duplicada del mismo papel).
  numero_movimiento text not null unique,
  numero_remito text,

  -- Número cargado a mano que más adelante se usa en otros circuitos como
  -- si fuera el número de guía del WMS.
  numero_etiqueta text unique,

  -- LOCAL N° / NOMBRE del rótulo.
  local_origen_codigo text not null,
  local_origen_nombre text,

  -- DESTINO del rótulo.
  local_destino_codigo text not null,
  local_destino_nombre text,
  domicilio_entrega text,

  fecha date not null,

  -- CHK / CQ / AW / ET5 tildado a mano en el rótulo.
  marca text check (marca in ('CHEEKY', 'COMO QUIERES', 'AWADA', 'ESTUDIO 5')),

  temporada text,
  tipo text,
  grupo text,
  subgrupo text,
  talle text,

  confecciono text,
  encargada text,

  -- Cantidad de bultos del interlocal (editable desde el formulario, ya no
  -- se asume 1 bulto por rótulo).
  cantidad_bultos integer not null default 1,
  observaciones text,

  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_hoja_de_ruta', 'despachado', 'anulado')),

  hoja_de_ruta_id bigint,

  registrado_por_id uuid references usuarios(id),
  registrado_por_nombre text,
  registrado_en timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Listado de pendientes por local destino + fecha, que es como la Hoja de
-- Ruta va a buscar qué hay disponible para cada local.
create index if not exists interlocales_destino_fecha_idx
  on interlocales (local_destino_codigo, fecha)
  where estado = 'pendiente';

create index if not exists interlocales_hoja_de_ruta_idx
  on interlocales (hoja_de_ruta_id);

-- Módulo "Pack and Hold": registra en qué posición del rack está cada guía de
-- franquicias que todavía no se despachó, y arma planes de recogida por cliente.
--
-- Pack and Hold NO escribe nada en el WMS: solo lee guías y contenedores
-- (importación desde el Agente Local) y guarda acá las posiciones.
--
-- Reglas que garantiza este esquema:
--   * Una posición, una guía: ph_posiciones.posicion es PRIMARY KEY, así que dos
--     operarios escaneando al mismo tiempo guías distintas en la misma posición
--     nunca pueden entrar los dos (el segundo recibe un error de unicidad).
--   * Una guía puede tener varias posiciones (varias filas con el mismo
--     despacho_cab_id).
--   * Un contenedor pertenece a una sola guía: ph_contenedores.contenedor es PK.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API routes
-- con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este repo).

-- Guías de franquicias en DP_INICIADO importadas del WMS (una fila por guía).
create table if not exists ph_guias (
  despacho_cab_id bigint primary key,
  guia text,
  cliente_codigo text,
  cliente_nombre text,
  estado_wms text,
  fecha_creacion timestamptz,
  total_contenedores integer not null default 0,
  -- pendiente: sigue en el WMS sin despachar; retirada: se cumplió su plan de
  -- recogida; despachada: la importación vio que ya no está en DP_INICIADO.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'retirada', 'despachada')),
  importada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

-- Contenedores de cada guía (detalle del WMS). Sirve para resolver la guía al
-- escanear un contenedor.
create table if not exists ph_contenedores (
  contenedor text primary key,
  despacho_cab_id bigint not null references ph_guias(despacho_cab_id) on delete cascade,
  unidades numeric,
  remito text
);

create index if not exists ph_contenedores_cab_idx on ph_contenedores (despacho_cab_id);

-- Packing list (SKU y cantidad por contenedor), tal como lo devuelve el WMS.
create table if not exists ph_packing_list (
  id bigint generated always as identity primary key,
  despacho_cab_id bigint not null references ph_guias(despacho_cab_id) on delete cascade,
  contenedor text not null,
  sku text not null,
  cantidad numeric
);

create index if not exists ph_packing_list_cab_idx on ph_packing_list (despacho_cab_id);

-- Qué guía (y de qué cliente) hay en cada posición. Solo existen las posiciones
-- ocupadas: al liberar una posición se borra la fila.
create table if not exists ph_posiciones (
  posicion text primary key,
  despacho_cab_id bigint not null references ph_guias(despacho_cab_id) on delete cascade,
  guia text,
  cliente_nombre text,
  contenedor_escaneado text,
  registrada_en timestamptz not null default now(),
  registrada_por uuid references usuarios(id)
);

create index if not exists ph_posiciones_cab_idx on ph_posiciones (despacho_cab_id);

-- Zonas del layout del almacén donde se puede usar Pack and Hold. Arranca solo
-- con RACK NAVE 2; el admin habilita más desde la pantalla "Zonas habilitadas".
create table if not exists ph_zonas_habilitadas (
  zona text primary key,
  habilitada boolean not null default false,
  actualizado_por uuid references usuarios(id),
  actualizado_en timestamptz not null default now()
);

insert into ph_zonas_habilitadas (zona, habilitada)
values ('RACK NAVE 2', true)
on conflict (zona) do nothing;

-- Planes de recogida (se usan a partir de la segunda tanda de implementación).
-- El código es PH-<cliente>, y PH-<cliente>-2, -3... si el cliente ya tiene otro
-- plan; los códigos no se reutilizan.
create table if not exists ph_planes (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  cliente_codigo text not null,
  cliente_nombre text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'completo', 'cancelado')),
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz
);

create index if not exists ph_planes_cliente_idx on ph_planes (cliente_codigo);

create table if not exists ph_plan_guias (
  plan_id bigint not null references ph_planes(id) on delete cascade,
  despacho_cab_id bigint not null references ph_guias(despacho_cab_id),
  primary key (plan_id, despacho_cab_id)
);

-- Lista congelada de posiciones del plan, con su orden sugerido (visual, no
-- obligatorio) y si ya se cumplieron.
create table if not exists ph_plan_posiciones (
  id bigint generated always as identity primary key,
  plan_id bigint not null references ph_planes(id) on delete cascade,
  despacho_cab_id bigint not null,
  posicion text not null,
  orden integer not null,
  ok boolean not null default false,
  ok_en timestamptz,
  ok_por uuid references usuarios(id),
  contenedor_escaneado text
);

create index if not exists ph_plan_posiciones_plan_idx on ph_plan_posiciones (plan_id);

-- Registro de cada posición registrada o liberada, recogida y error.
create table if not exists ph_eventos (
  id bigint generated always as identity primary key,
  tipo text not null,
  contenedor text,
  guia text,
  posicion text,
  plan_codigo text,
  resultado text not null check (resultado in ('ok', 'error')),
  mensaje text,
  usuario_id uuid references usuarios(id),
  ocurrido_en timestamptz not null default now()
);

create index if not exists ph_eventos_ocurrido_idx on ph_eventos (ocurrido_en desc);

-- Botón "Importar guías pendientes (WMS)": nueva sección válida de actualizaciones_wms.
alter table actualizaciones_wms
  drop constraint if exists actualizaciones_wms_seccion_check;

alter table actualizaciones_wms
  add constraint actualizaciones_wms_seccion_check
  check (seccion in ('no_ecom', 'ecom', 'carga_inicial', 'remanentes', 'pd_clientes', 'pd_propios',
                      'ocupacion_almacen', 'productividad', 'despacho_importar', 'despacho_imprimir',
                      'despacho_reimprimir', 'exp_etiquetas', 'contenedores_wms', 'urgencias_estados_wms',
                      'pack_hold_importar'));

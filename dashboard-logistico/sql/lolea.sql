-- Módulo "Lolea": mini WMS para el stock del emprendimiento de Lolea, que no está
-- en el WMS de Altatex. Cubre recepción en stage, ubicación en posiciones, stock,
-- pedidos, planificación y preparación del pickeo, y despacho.
--
-- Lolea NO escribe nada en el WMS: todo vive en estas tablas.
--
-- Se crean TODAS las tablas del módulo de una vez (aunque la fase 1 solo use
-- lol_skus, lol_stock y lol_movimientos) para no tener que volver a correr SQL
-- en cada fase.
--
-- Reglas que garantiza este esquema:
--   * Artículo + variante es único (lol_skus).
--   * El stock es una fila por artículo y ubicación (lol_stock). La ubicación es
--     'STAGE' (ubicación virtual sin límite donde entra todo) o una posición del
--     layout. La cantidad nunca es negativa.
--   * Todo cambio de stock deja un movimiento en lol_movimientos.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API routes
-- con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este repo).
-- Es seguro correrlo más de una vez: no pisa datos ya cargados.

-- Maestro de artículos. "grupo" y "orden" solo ordenan la pantalla de Stock.
create table if not exists lol_skus (
  id bigint generated always as identity primary key,
  articulo text not null,
  variante text not null,
  unidad text not null,
  stock_seguridad integer not null default 0 check (stock_seguridad >= 0),
  grupo text,
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (articulo, variante)
);

-- Stock por artículo y ubicación ('STAGE' o una posición).
create table if not exists lol_stock (
  sku_id bigint not null references lol_skus(id),
  ubicacion text not null,
  cantidad integer not null check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (sku_id, ubicacion)
);

create index if not exists lol_stock_ubicacion_idx on lol_stock (ubicacion);

-- Libro de movimientos: de dónde a dónde se movió cuánto, y quién.
create table if not exists lol_movimientos (
  id bigint generated always as identity primary key,
  sku_id bigint not null references lol_skus(id),
  tipo text not null check (tipo in ('inicial', 'recepcion', 'ubicacion', 'pickeo', 'ajuste')),
  ubicacion_origen text,
  ubicacion_destino text,
  cantidad integer not null,
  pedido_id bigint,
  motivo text,
  usuario_id uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

create index if not exists lol_movimientos_sku_idx on lol_movimientos (sku_id, creado_en desc);

-- Clientes de Lolea.
create table if not exists lol_clientes (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  direccion text,
  contacto text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Pedidos (fases 3 en adelante). El número es LOL-0001, LOL-0002...
create sequence if not exists lol_pedido_seq;

create table if not exists lol_pedidos (
  id bigint generated always as identity primary key,
  numero text not null unique default ('LOL-' || lpad(nextval('lol_pedido_seq')::text, 4, '0')),
  cliente_id bigint not null references lol_clientes(id),
  estado text not null default 'cargado'
    check (estado in ('cargado', 'planificado', 'en_preparacion', 'preparado', 'despachado', 'cancelado')),
  fecha_entrega date,
  observaciones text,
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now(),
  planificado_en timestamptz,
  planificado_por uuid references usuarios(id),
  preparado_en timestamptz,
  despachado_en timestamptz,
  actualizado_en timestamptz not null default now()
);

create index if not exists lol_pedidos_estado_idx on lol_pedidos (estado);

create table if not exists lol_pedido_lineas (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references lol_pedidos(id) on delete cascade,
  sku_id bigint not null references lol_skus(id),
  cantidad integer not null check (cantidad > 0),
  cantidad_preparada integer not null default 0 check (cantidad_preparada >= 0)
);

create index if not exists lol_pedido_lineas_pedido_idx on lol_pedido_lineas (pedido_id);

-- Plan de pickeo congelado de un pedido planificado (fases 4 y 5). Las filas sin
-- cumplir (ok = false) son la reserva de stock.
create table if not exists lol_picking (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references lol_pedidos(id) on delete cascade,
  linea_id bigint not null references lol_pedido_lineas(id) on delete cascade,
  sku_id bigint not null references lol_skus(id),
  posicion text not null,
  cantidad integer not null check (cantidad > 0),
  orden integer not null,
  ok boolean not null default false,
  cantidad_real integer,
  ok_en timestamptz,
  ok_por uuid references usuarios(id)
);

create index if not exists lol_picking_pedido_idx on lol_picking (pedido_id);
create index if not exists lol_picking_pendiente_idx on lol_picking (sku_id) where ok = false;

-- Salida del pedido (fase 5).
create table if not exists lol_despachos (
  id bigint generated always as identity primary key,
  pedido_id bigint not null unique references lol_pedidos(id),
  transporte text,
  remito text,
  bultos integer,
  retira text,
  fecha_despacho date,
  creado_por uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

-- Auditoría de cada acción y error.
create table if not exists lol_eventos (
  id bigint generated always as identity primary key,
  tipo text not null,
  sku_id bigint,
  ubicacion text,
  pedido_numero text,
  cantidad integer,
  resultado text not null check (resultado in ('ok', 'error')),
  mensaje text,
  usuario_id uuid references usuarios(id),
  ocurrido_en timestamptz not null default now()
);

create index if not exists lol_eventos_ocurrido_idx on lol_eventos (ocurrido_en desc);

-- ---------------------------------------------------------------------------
-- Maestro inicial (22 artículos) y su stock inicial, todo en STAGE.
-- Para la fase 1 el maquinista todavía no ubicó nada en posiciones.
-- Nombres ajustados respecto del Excel: "contenedor oz" -> "contenedor 50 oz" y
-- las dos "Tapa Vaso x 2000" se distinguen por el vaso al que corresponden.
-- ---------------------------------------------------------------------------
with maestro (grupo, orden, articulo, variante, unidad, seguridad, stock) as (
  values
    ('Contenedores 25 oz',  1, 'tapas contenedor 25 oz',   'cristal x 300 u',            'Caja',   45, 205),
    ('Contenedores 25 oz',  2, 'contenedor 25 oz',         'bordo pleno x 200 u',        'Caja',   25,  63),
    ('Contenedores 25 oz',  3, 'contenedor 25 oz',         'bordo forma 1 x 200 u',      'Caja',   25,  94),
    ('Contenedores 25 oz',  4, 'contenedor 25 oz',         'bordo forma 2 x 200 u',      'Caja',   25,  84),
    ('Contenedores 50 oz',  5, 'tapas contenedor 50 oz',   'cristal x 240 u',            'Caja',   36, 210),
    ('Contenedores 50 oz',  6, 'contenedor 50 oz',         'amarillo pleno x 120 u',     'Caja',   27,  30),
    ('Contenedores 50 oz',  7, 'contenedor 50 oz',         'amarillo forma 1 x 120 u',   'Caja',   27,  54),
    ('Contenedores 50 oz',  8, 'contenedor 50 oz',         'amarillo forma 2 x 120 u',   'Caja',   27, 234),
    ('Botellas',            9, 'Botella',                  '(cantidad x pallet: 800 u)', 'Pallet',  1,   8),
    ('Botellas',           10, 'Tapa Botella',             '(verificar cantidad)',       'Caja',    0,   1),
    ('Vasos',              11, 'Vasos 8oz',                'amarillas x 1000 u',         'Caja',    2,   2),
    ('Vasos',              12, 'Vasos 8oz',                'bordo x 1000 u',             'Caja',    2,   4),
    ('Vasos',              13, 'Tapa Vaso',                'x 2000 (para 8oz)',          'Caja',    2,   3),
    ('Vasos',              14, 'Vasos 12oz',               'amarillas x 1000 u',         'Caja',    2,   4),
    ('Vasos',              15, 'Vasos 12oz',               'bordo x 1000 u',             'Caja',    2,   4),
    ('Vasos',              16, 'Tapa Vaso',                'x 2000 (para 12oz)',         'Caja',    2,   3),
    ('Bolsas y papel',     17, 'Bolsas sobre',             'blancas x 1000',             'Bulto',   2,   1),
    ('Bolsas y papel',     18, 'Papel parafinado',         '40 x 25',                    'Pallet',  2,   3),
    ('Bolsas y papel',     19, 'Papel parafinado',         '20 x 30',                    'Pallet',  2,   3),
    ('Bolsas y papel',     20, 'Bolsas en caja con manija','N 9 x 250 u',                'Caja',    0,   0),
    ('Bolsas y papel',     21, 'Cajas Lolea',              'x25 u',                      'Pack',    2,  26),
    ('Bolsas y papel',     22, 'sobre Sulfito A4',         'blancas x 2000',             'Pallet',  2,   2)
),
altas as (
  insert into lol_skus (articulo, variante, unidad, stock_seguridad, grupo, orden)
  select articulo, variante, unidad, seguridad, grupo, orden from maestro
  on conflict (articulo, variante) do nothing
  returning id
)
select count(*) as articulos_nuevos from altas;

-- Stock inicial en STAGE y su movimiento. Solo para artículos que todavía no
-- tienen un movimiento inicial, así correr este script de nuevo no duplica nada.
with inicial (articulo, variante, stock) as (
  values
    ('tapas contenedor 25 oz',   'cristal x 300 u',            205),
    ('contenedor 25 oz',         'bordo pleno x 200 u',         63),
    ('contenedor 25 oz',         'bordo forma 1 x 200 u',       94),
    ('contenedor 25 oz',         'bordo forma 2 x 200 u',       84),
    ('tapas contenedor 50 oz',   'cristal x 240 u',            210),
    ('contenedor 50 oz',         'amarillo pleno x 120 u',      30),
    ('contenedor 50 oz',         'amarillo forma 1 x 120 u',    54),
    ('contenedor 50 oz',         'amarillo forma 2 x 120 u',   234),
    ('Botella',                  '(cantidad x pallet: 800 u)',   8),
    ('Tapa Botella',             '(verificar cantidad)',         1),
    ('Vasos 8oz',                'amarillas x 1000 u',           2),
    ('Vasos 8oz',                'bordo x 1000 u',               4),
    ('Tapa Vaso',                'x 2000 (para 8oz)',            3),
    ('Vasos 12oz',               'amarillas x 1000 u',           4),
    ('Vasos 12oz',               'bordo x 1000 u',               4),
    ('Tapa Vaso',                'x 2000 (para 12oz)',           3),
    ('Bolsas sobre',             'blancas x 1000',               1),
    ('Papel parafinado',         '40 x 25',                      3),
    ('Papel parafinado',         '20 x 30',                      3),
    ('Cajas Lolea',              'x25 u',                       26),
    ('sobre Sulfito A4',         'blancas x 2000',               2)
),
nuevos as (
  select s.id as sku_id, i.stock
  from inicial i
  join lol_skus s on s.articulo = i.articulo and s.variante = i.variante
  where i.stock > 0
    and not exists (select 1 from lol_movimientos m where m.sku_id = s.id and m.tipo = 'inicial')
),
stock_stage as (
  insert into lol_stock (sku_id, ubicacion, cantidad)
  select sku_id, 'STAGE', stock from nuevos
  on conflict (sku_id, ubicacion) do nothing
  returning sku_id
)
insert into lol_movimientos (sku_id, tipo, ubicacion_destino, cantidad, motivo)
select sku_id, 'inicial', 'STAGE', stock, 'Stock inicial del maestro'
from nuevos;

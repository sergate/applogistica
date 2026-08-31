-- Módulo "Despacho" (Para Imprimir / Para Reimprimir): estado actual de cada
-- guía (importado desde el WMS) + log de cada intento de impresión.
--
-- No usa RLS: como el resto de la app, todo el acceso pasa por las API
-- routes con la Service Role Key.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

-- Una fila por guía de despacho del WMS (despacho_cab_id es el ID que usa el
-- propio WMS -- no se genera acá). Se actualiza por upsert en cada importación
-- (ver /api/actualizaciones/agente/despacho/importar): los campos de cabecera
-- se pisan con lo último importado, las columnas de impresión NO se tocan.
create table if not exists despacho_guias (
  id bigint generated always as identity primary key,
  despacho_cab_id bigint not null unique,
  guia text,
  numero_guia text,
  numero_comprobante text,
  tipo text,
  cliente text,
  transporte text,
  estado_wms text,
  fecha_creacion timestamptz,
  cajas numeric,
  unidades numeric,
  zona text,
  patente text,
  guia_impresa boolean not null default false,
  guia_impresa_en timestamptz,
  guia_impresa_por_nombre text,
  remito_impreso boolean not null default false,
  remito_impreso_en timestamptz,
  remito_impreso_por_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists despacho_guias_estado_impresion_idx
  on despacho_guias (guia_impresa, remito_impreso);

-- Log append-only de cada intento de imprimir un paso (guía o remito) de una
-- guía, tanto en la primera impresión como en cada reimpresión -- es lo que
-- registra qué usuario y cuándo pidió reimprimir, sin perder historial.
create table if not exists despacho_impresion_eventos (
  id bigint generated always as identity primary key,
  trabajo_id bigint references actualizaciones_wms(id),
  despacho_cab_id bigint not null,
  guia text,
  tipo text not null check (tipo in ('impresion', 'reimpresion')),
  paso text not null check (paso in ('guia', 'remito')),
  resultado text not null check (resultado in ('ok', 'error')),
  mensaje text,
  usuario_id uuid not null references usuarios(id),
  ocurrido_en timestamptz not null default now()
);

create index if not exists despacho_impresion_eventos_cab_idx
  on despacho_impresion_eventos (despacho_cab_id, ocurrido_en desc);

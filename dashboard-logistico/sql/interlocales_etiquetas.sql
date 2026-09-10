-- Etiquetas de interlocal pre-impresas en blanco (código de barras
-- correlativo "interlocal-00001", etc., en una Zebra ZD421 de red) -- se
-- pegan en el bulto ANTES de cargar el Interlocal; el número queda de
-- referencia para completar "N° Etiqueta" al transcribir el rótulo.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

create table if not exists interlocales_etiquetas_contador (
  id smallint primary key default 1,
  ultimo_numero integer not null default 0,
  constraint interlocales_etiquetas_contador_una_fila check (id = 1)
);
insert into interlocales_etiquetas_contador (id, ultimo_numero)
  values (1, 0)
  on conflict (id) do nothing;

-- Reserva "cantidad" números de una sola vez, de forma atómica (el UPDATE
-- toma el lock de la fila, así que dos impresiones simultáneas no se
-- pueden llevar el mismo rango de números).
create or replace function reservar_numeros_etiqueta_interlocal(cantidad integer)
returns setof integer
language plpgsql
as $$
declare
  nuevo_ultimo integer;
begin
  update interlocales_etiquetas_contador
    set ultimo_numero = ultimo_numero + cantidad
    where id = 1
    returning ultimo_numero into nuevo_ultimo;
  return query select generate_series(nuevo_ultimo - cantidad + 1, nuevo_ultimo);
end;
$$;

-- Log de cada número que se imprimió -- como el contador nunca retrocede,
-- alcanza con la unicidad de "numero"/"texto" para que sea imposible
-- repetir una etiqueta.
create table if not exists interlocales_etiquetas_impresas (
  id bigint generated always as identity primary key,
  numero integer not null unique,
  texto text not null unique,
  impreso_por_id uuid references usuarios(id),
  impreso_por_nombre text,
  impreso_en timestamptz not null default now()
);

create index if not exists interlocales_etiquetas_impresas_impreso_en_idx
  on interlocales_etiquetas_impresas (impreso_en desc);

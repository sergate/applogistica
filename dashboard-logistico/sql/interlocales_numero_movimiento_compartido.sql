-- El contador de "N° de Movimiento" automático vivía separado de los
-- números que se cargan a mano -- podía asignar uno ya usado y chocar
-- contra el UNIQUE de interlocales.numero_movimiento, o quedar muy atrás
-- de la numeración real.
--
-- La numeración automática solo aplica a interlocales "productos"/"varios"
-- con origen 33000 (CD) -- ver ORIGEN_CODIGO_NUMERACION_AUTOMATICA en
-- src/app/api/interlocales/route.ts. Por eso el máximo del que arranca el
-- contador se calcula SOLO sobre esos mismos interlocales (mismo tipo,
-- mismo origen) -- no sobre todos los productos/varios de cualquier
-- origen, que son una numeración aparte sin relación con esta secuencia.
-- "control_calidad" queda afuera siempre -- tiene su propia nomenclatura.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo).

create or replace function maximo_numero_movimiento_interlocal()
returns integer
language sql
stable
as $$
  select coalesce(max(numero_movimiento::integer), 0)
  from interlocales
  where numero_movimiento ~ '^[0-9]+$'
    and tipo_envio in ('productos', 'varios')
    and local_origen_codigo = '33000';
$$;

create or replace function siguiente_numero_varios_interlocal()
returns integer
language plpgsql
as $$
declare
  nuevo integer;
begin
  update interlocales_contador_varios
    set ultimo_numero = greatest(ultimo_numero, maximo_numero_movimiento_interlocal()) + 1
    where id = 1
    returning ultimo_numero into nuevo;
  return nuevo;
end;
$$;

-- Mismo cálculo pero de solo lectura, para la vista previa del formulario
-- (no reserva nada) -- así siempre coincide con lo que va a asignar
-- siguiente_numero_varios_interlocal() al guardar.
create or replace function proximo_numero_varios_interlocal_preview()
returns integer
language sql
stable
as $$
  select greatest(
    (select ultimo_numero from interlocales_contador_varios where id = 1),
    maximo_numero_movimiento_interlocal()
  ) + 1;
$$;

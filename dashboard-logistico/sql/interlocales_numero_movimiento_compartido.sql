-- El contador de "N° de Movimiento" para interlocales tipo "varios" vivía
-- separado de los números que se cargan a mano para "productos" (que salen
-- del rótulo físico/WMS) -- podía asignar un número ya usado por un
-- "productos" y chocar contra el UNIQUE de interlocales.numero_movimiento,
-- o simplemente ir muy atrás de la numeración real.
--
-- Ahora el contador de "varios" siempre arranca desde el mayor N° de
-- Movimiento que exista en la tabla (de cualquier tipo), así los dos
-- comparten la misma secuencia y nunca se pisan.
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
  where numero_movimiento ~ '^[0-9]+$';
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

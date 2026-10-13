-- Lolea, fase 2 (layout e ingreso): funciones que mueven el stock de forma atómica.
--
-- Cada función hace el cambio de stock y deja su movimiento en lol_movimientos
-- dentro de la misma transacción, así nunca queda un stock modificado sin su
-- movimiento. lol_ubicar bloquea la fila del STAGE del artículo (FOR UPDATE):
-- si dos personas ubican al mismo tiempo, la segunda espera y después ve el saldo
-- ya descontado, así que nunca se ubica más de lo que hay.
--
-- Las dos validan lo que no depende del layout (cantidad entera, artículo activo,
-- saldo suficiente). Que la posición exista en el layout de Lolea lo valida la
-- API antes de llamar a lol_ubicar.
--
-- IMPORTANTE: además de este archivo hay que volver a correr
-- sql/almacen_resumen_agrupado.sql (cambió: ahora excluye la zona LOLEA de
-- Ocupación Almacén).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto `test`
-- como en el de producción. Es seguro correrlo más de una vez (CREATE OR REPLACE).

-- Recibir mercadería: suma al STAGE. Devuelve el saldo del STAGE.
create or replace function lol_recibir(
  p_sku bigint,
  p_cantidad integer,
  p_usuario uuid,
  p_referencia text default null
)
returns integer
language plpgsql
as $$
declare
  v_stage integer;
begin
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad tiene que ser un entero de 1 en adelante.';
  end if;

  perform 1 from lol_skus where id = p_sku and activo;
  if not found then
    raise exception 'El artículo no existe o está inactivo.';
  end if;

  insert into lol_stock (sku_id, ubicacion, cantidad)
  values (p_sku, 'STAGE', p_cantidad)
  on conflict (sku_id, ubicacion)
  do update set cantidad = lol_stock.cantidad + excluded.cantidad, actualizado_en = now()
  returning cantidad into v_stage;

  insert into lol_movimientos (sku_id, tipo, ubicacion_destino, cantidad, motivo, usuario_id)
  values (p_sku, 'recepcion', 'STAGE', p_cantidad, nullif(trim(p_referencia), ''), p_usuario);

  return v_stage;
end;
$$;

-- Ubicar desde el STAGE: baja el STAGE y suma en la posición, por la cantidad
-- que se transfiere (puede ser parcial). Devuelve lo que queda en STAGE y lo que
-- hay ahora en la posición.
create or replace function lol_ubicar(
  p_sku bigint,
  p_cantidad integer,
  p_posicion text,
  p_usuario uuid
)
returns table (stage_restante integer, en_posicion integer)
language plpgsql
as $$
declare
  v_stage integer;
begin
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad tiene que ser un entero de 1 en adelante.';
  end if;
  if p_posicion is null or trim(p_posicion) = '' or upper(trim(p_posicion)) = 'STAGE' then
    raise exception 'La posición no es válida.';
  end if;

  select cantidad into v_stage
  from lol_stock
  where sku_id = p_sku and ubicacion = 'STAGE'
  for update;

  if v_stage is null or v_stage < p_cantidad then
    raise exception 'No podés ubicar %: en stage hay %.', p_cantidad, coalesce(v_stage, 0);
  end if;

  if v_stage = p_cantidad then
    delete from lol_stock where sku_id = p_sku and ubicacion = 'STAGE';
  else
    update lol_stock
    set cantidad = cantidad - p_cantidad, actualizado_en = now()
    where sku_id = p_sku and ubicacion = 'STAGE';
  end if;

  insert into lol_stock (sku_id, ubicacion, cantidad)
  values (p_sku, p_posicion, p_cantidad)
  on conflict (sku_id, ubicacion)
  do update set cantidad = lol_stock.cantidad + excluded.cantidad, actualizado_en = now()
  returning cantidad into en_posicion;

  insert into lol_movimientos (sku_id, tipo, ubicacion_origen, ubicacion_destino, cantidad, usuario_id)
  values (p_sku, 'ubicacion', 'STAGE', p_posicion, p_cantidad, p_usuario);

  stage_restante := v_stage - p_cantidad;
  return next;
end;
$$;

-- "Tipo de envío" del interlocal: "productos" (todo se carga a mano, como
-- hasta ahora) o "varios" (el N° de Remito no se carga a mano -- se asigna
-- solo con un número correlativo propio, separado de los remitos reales,
-- que se incrementa cada vez que se crea un interlocal "varios").
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table interlocales add column if not exists tipo_envio text not null default 'productos'
  check (tipo_envio in ('productos', 'varios'));

-- Contador de una sola fila para el número correlativo de "varios".
create table if not exists interlocales_contador_varios (
  id smallint primary key default 1,
  ultimo_numero integer not null default 0,
  constraint interlocales_contador_varios_una_fila check (id = 1)
);
insert into interlocales_contador_varios (id, ultimo_numero)
  values (1, 0)
  on conflict (id) do nothing;

-- Incrementa y devuelve el próximo número de forma atómica (el UPDATE toma
-- el lock de la fila, así que dos interlocales "varios" creados al mismo
-- tiempo no se pueden llevar el mismo número).
create or replace function siguiente_numero_varios_interlocal()
returns integer
language sql
as $$
  update interlocales_contador_varios
    set ultimo_numero = ultimo_numero + 1
    where id = 1
    returning ultimo_numero;
$$;

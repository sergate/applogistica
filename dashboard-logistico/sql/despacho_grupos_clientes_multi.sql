-- Permite que un cliente pertenezca a más de un grupo a la vez (es común que
-- reciba mercadería en días distintos, ej. "Jueves Propios" y "Martes
-- Propios"). Antes codigo_cliente era la primary key de la tabla de
-- miembros, así que agregarlo a un grupo nuevo lo sacaba del anterior --
-- ahora la clave es la combinación (grupo_id, codigo_cliente).
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción.

alter table despacho_grupos_clientes_miembros drop constraint despacho_grupos_clientes_miembros_pkey;
alter table despacho_grupos_clientes_miembros add primary key (grupo_id, codigo_cliente);

create index if not exists despacho_grupos_clientes_miembros_codigo_idx
  on despacho_grupos_clientes_miembros (codigo_cliente);

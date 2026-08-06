-- Agregación en Postgres del resumen de Ocupación Almacén, para reemplazar
-- el cálculo que hoy hace src/app/api/almacen/resumen/route.ts en JS después
-- de traer almacen_layout + almacen_ocupacion COMPLETAS a memoria (esta
-- última tiene cientos de miles de filas / >100MB).
--
-- IMPORTANTE: la clasificación de zonas (Zona -> grupo/subzona) está
-- duplicada acá y en src/lib/almacenHelpers.ts (MAPA_ZONAS). Si se agrega o
-- cambia un valor de Zona ahí, hay que replicarlo en este CASE WHEN.
--
-- Correr manualmente en el SQL editor de Supabase, tanto en el proyecto
-- `test` como en el de producción (no hay migraciones automáticas en este
-- repo). Re-ejecutar este archivo entero reemplaza la función existente
-- (CREATE OR REPLACE).

create or replace function almacen_resumen_agrupado()
returns table (
  grupo text,
  subzona text,
  capacidad bigint,
  ocupadas bigint
)
language sql
stable
as $$
  with clasificado as (
    select
      l.ubicacion,
      case upper(trim(l.zona))
        when 'RACK NAVE 2'    then 'Pallet'
        when 'RACK AWADA'     then 'Pallet'
        when 'MZN CAL 3'      then 'Calzado'
        when 'MZN IND 1'      then 'Indumentaria'
        when 'MZN IND 2'      then 'Indumentaria'
        when 'MZN IND 3'      then 'Indumentaria'
        when 'MZN IND 4'      then 'Indumentaria'
        when 'PALLET F01'     then 'Indumentaria'
        when 'PERCHERO AWADA' then 'AWADA'
        when 'PICKING AWADA'  then 'AWADA'
        else 'Sin clasificar'
      end as grupo,
      case upper(trim(l.zona))
        when 'RACK NAVE 2'    then 'NAVE 2'
        when 'RACK AWADA'     then 'NAVE 3'
        when 'MZN CAL 3'      then 'MZN PISO 3'
        when 'MZN IND 1'      then 'MZN PISO 1'
        when 'MZN IND 2'      then 'MZN PISO 2'
        when 'MZN IND 3'      then 'MZN PISO 3'
        when 'MZN IND 4'      then 'MZN PISO 4'
        when 'PALLET F01'     then 'PALLET F01'
        when 'PERCHERO AWADA' then 'PERCHEROS'
        when 'PICKING AWADA'  then 'PICKING'
        else coalesce(nullif(trim(l.zona), ''), 'SIN ZONA')
      end as subzona
    from almacen_layout l
  ),
  contenedores_por_ubicacion as (
    select ubicacion, count(*) as cant
    from almacen_ocupacion
    group by ubicacion
  ),
  filas as (
    select
      c.grupo,
      c.subzona,
      -- Capacidad por posición: MZN admite 6 contenedores, PALLET F01 admite
      -- 10, el resto (tipo pallet) cuenta 1 por posición.
      case
        when c.subzona like 'MZN%'    then 6
        when c.subzona = 'PALLET F01' then 10
        else 1
      end as capacidad_fila,
      -- Ocupadas: en sub-filas "por contenedor" (MZN y PALLET F01) se suman
      -- los contenedores únicos con stock>0 de esa posición; en el resto
      -- (tipo pallet) la posición cuenta como ocupada (1) si tiene 1+
      -- contenedores, vacía (0) si no tiene ninguno.
      case
        when c.subzona like 'MZN%' or c.subzona = 'PALLET F01'
          then coalesce(o.cant, 0)
        else case when coalesce(o.cant, 0) > 0 then 1 else 0 end
      end as ocupadas_fila
    from clasificado c
    left join contenedores_por_ubicacion o on o.ubicacion = c.ubicacion
    where not exists (
      -- Grupo/subzona apagado desde Configuración -- se excluye por completo,
      -- igual que hace hoy la ruta en JS.
      select 1 from almacen_indicadores_config cfg
      where cfg.grupo = c.grupo and cfg.subzona = c.subzona and cfg.habilitado = false
    )
  )
  select
    grupo,
    subzona,
    sum(capacidad_fila)::bigint as capacidad,
    sum(ocupadas_fila)::bigint as ocupadas
  from filas
  group by grupo, subzona;
$$;

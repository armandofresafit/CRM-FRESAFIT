-- ============================================================================
-- Fresafit CRM — Categorías reales, Mercado Full y datos para el reorden
-- ----------------------------------------------------------------------------
-- 1) products.tipo pasa de 6 categorías genéricas a las 8 líneas que el negocio
--    compra y repone por separado (+ 'otro'):
--      cinturones  ->  cinturon_powerlift (SKU SBD…) | cinturon_hebilla (PRM…)
--      straps      ->  straps_pro (STR###) | straps_viejos (STR###OG)
--      munequeras  ->  munequeras_pro (MQR###) | munequeras_viejos (MQR###OG)
--      mochilas, ropa y otro se conservan.
--    El SKU manda; el nombre es el respaldo (misma regla que
--    lib/inventario/tipo-producto.ts). Orden obligatorio: quitar el CHECK viejo,
--    remapear y recién entonces volver a endurecerlo.
-- 2) products.meli_logistic_type: modalidad de envío de la publicación de ML.
--    'fulfillment' = Mercado Full (el stock está en un centro de ML, no en la
--    bodega); lo llena la sync de Mercado Libre.
-- 3) suppliers.dias_entrega: cuánto tarda en llegar un pedido de ese proveedor.
--    Es la entrada del cálculo de punto de reorden.
--
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Quitar el CHECK viejo ANTES de remapear (si no, rechaza los valores nuevos).
-- ---------------------------------------------------------------------------
alter table public.products drop constraint if exists products_tipo_check;

-- ---------------------------------------------------------------------------
-- 2) Remapear los datos existentes. Cada update deja fuera lo ya reclasificado
--    (tipo in (…viejos…)) para que re-ejecutarlo sea inofensivo.
-- ---------------------------------------------------------------------------
with clasificado as (
  select id,
         case
           -- Por prefijo de SKU (la fuente confiable entre canales).
           when upper(coalesce(sku, '')) like 'SBD%' then 'cinturon_powerlift'
           when upper(coalesce(sku, '')) like 'PRM%' then 'cinturon_hebilla'
           when upper(coalesce(sku, '')) like 'STR%' then
             case when upper(sku) like '%OG' or nombre ~* '\mog\M'
                  then 'straps_viejos' else 'straps_pro' end
           when upper(coalesce(sku, '')) like 'MQR%' then
             case when upper(sku) like '%OG' or nombre ~* '\mog\M'
                  then 'munequeras_viejos' else 'munequeras_pro' end
           -- Por nombre (renglones sin SKU o con SKU fuera de patrón).
           when nombre ilike '%powerlift%' then 'cinturon_powerlift'
           when nombre ilike '%hebilla%'
             or (nombre ilike '%faja%' and nombre ilike '%premium%') then 'cinturon_hebilla'
           when nombre ilike '%strap%' then
             case when nombre ~* '\mog\M' then 'straps_viejos' else 'straps_pro' end
           when nombre ilike '%muñequ%' or nombre ilike '%munequ%' or nombre ilike '%wraps%' then
             case when nombre ~* '\mog\M' then 'munequeras_viejos' else 'munequeras_pro' end
           when nombre ~* 'mochila|maleta|morral|backpack|cangurera|crossbody' then 'mochilas'
           when nombre ~* 'playera|camiseta|tank|sudadera|hoodie|short|legging|jogger|gorra|calceta|falda|\mbra\M|sweatpant|pump cover|chaqueta|\mtop\M' then 'ropa'
           -- Sin señal: se conserva lo que ya era compatible; el resto a 'otro'.
           when tipo in ('mochilas', 'ropa') then tipo
           else 'otro'
         end as tipo_nuevo
    from public.products
   where tipo in ('cinturones', 'straps', 'munequeras', 'mochilas', 'ropa', 'otro')
)
update public.products p
   set tipo = c.tipo_nuevo
  from clasificado c
 where c.id = p.id and c.tipo_nuevo is distinct from p.tipo;

-- Red de seguridad: cualquier valor que no sea de la lista nueva cae en 'otro'
-- (si no, el CHECK de abajo no se puede crear).
update public.products
   set tipo = 'otro'
 where tipo not in ('cinturon_powerlift','cinturon_hebilla','straps_pro','munequeras_pro',
                    'straps_viejos','munequeras_viejos','mochilas','ropa','otro');

-- ---------------------------------------------------------------------------
-- 3) Volver a endurecer el CHECK con las categorías nuevas.
-- ---------------------------------------------------------------------------
alter table public.products
  add constraint products_tipo_check
  check (tipo in ('cinturon_powerlift','cinturon_hebilla','straps_pro','munequeras_pro',
                  'straps_viejos','munequeras_viejos','mochilas','ropa','otro'));

alter table public.products alter column tipo set default 'otro';

-- ---------------------------------------------------------------------------
-- 4) Mercado Full: modalidad de envío de la publicación (la escribe la sync).
--    'fulfillment' | 'cross_docking' | 'drop_off' | 'xd_drop_off' | 'self_service'
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists meli_logistic_type text;

create index if not exists products_meli_full_idx
  on public.products(meli_logistic_type)
  where meli_logistic_type = 'fulfillment';

-- ---------------------------------------------------------------------------
-- 5) Tiempo de entrega del proveedor (entrada del punto de reorden).
-- ---------------------------------------------------------------------------
alter table public.suppliers add column if not exists dias_entrega int;
alter table public.suppliers drop constraint if exists suppliers_dias_entrega_check;
alter table public.suppliers
  add constraint suppliers_dias_entrega_check check (dias_entrega is null or dias_entrega >= 0);

-- ---------------------------------------------------------------------------
-- 6) El reabastecimiento agrupa el catálogo por SKU en cada carga de Inventario.
-- ---------------------------------------------------------------------------
create index if not exists products_sku_idx on public.products(sku);

notify pgrst, 'reload schema';

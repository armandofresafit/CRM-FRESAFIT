-- ============================================================================
-- Fresafit CRM — Productos bajo pedido (sin control de stock)
-- ----------------------------------------------------------------------------
-- Los personalizados no se fabrican para tener en bodega: se hacen cuando
-- alguien los compra. En Mercado Libre están publicados con 1000 unidades justo
-- por eso. En el CRM quedaban con stock 0 y, como sí se venden, «Qué pedir» los
-- marcaba en rojo y engordaban la cuenta de agotados: ruido sobre una alerta que
-- solo sirve si todo lo que está en rojo es accionable.
--
-- `bajo_pedido` los saca del semáforo de stock, de los agotados y del cálculo de
-- reabastecimiento. No cambia nada más: siguen vendiéndose y contando en
-- métricas y en el historial.
--
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

alter table public.products
  add column if not exists bajo_pedido boolean not null default false;

-- Los personalizados que hoy existen. El resto (bundles, mystery box…) se marca
-- a mano desde la ficha del producto: aquí solo entra lo confirmado.
update public.products
   set bajo_pedido = true
 where bajo_pedido = false
   and (
     upper(coalesce(sku, '')) like 'PRMPER%'
     or upper(coalesce(sku, '')) like 'SBDPER%'
     or nombre ilike '%personalizado%'
     or nombre ilike '%personalizada%'
   );

notify pgrst, 'reload schema';

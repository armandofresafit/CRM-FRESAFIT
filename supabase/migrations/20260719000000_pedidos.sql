-- ============================================================================
-- Fresafit CRM — Fase 5: Pedidos y envíos
-- ----------------------------------------------------------------------------
-- Un pedido ES una venta (mismas filas de `sales`): solo se agregan las
-- columnas de envío. Cero migración de datos, cero doble captura.
--   * estado: nuevo → preparando → enviado → entregado (o cancelado).
--     NULL = venta directa/histórica sin flujo de envío (no sale en pendientes).
--   * paqueteria / num_guia: texto libre (las paqueterías cambian; sin CHECK).
-- Semántica de captura (la aplica la UI/importador, no la BD):
--   punto_fisico → 'entregado';  canales online → 'nuevo'.
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

alter table public.sales add column if not exists estado text
  check (estado in ('nuevo','preparando','enviado','entregado','cancelado'));
alter table public.sales add column if not exists paqueteria text;
alter table public.sales add column if not exists num_guia text;

create index if not exists sales_estado_idx on public.sales(estado);

-- Sin backfill ciego: el estado real de cada pedido (nuevo/preparando/enviado/
-- entregado) lo trae la importación desde el shipping_status de Tienda Nube, así
-- la bandeja de pendientes refleja la realidad y no 869 pedidos falsos "nuevos".

notify pgrst, 'reload schema';

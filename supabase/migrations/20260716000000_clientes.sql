-- ============================================================================
-- Fresafit CRM — Fase 4: Clientes y ventas
-- ----------------------------------------------------------------------------
-- Extiende la tabla esqueleto `customers` (ya existía y `sales.cliente_id` le
-- apunta desde la Fase 2, así que no hay que migrar datos).
--   * Datos de contacto + canal de origen + notas (mayoreo, atención especial).
--   * tiendanube_customer_id: el cliente de cada orden importada se crea y se
--     liga solo, así el historial de compras se llena sin capturar nada.
-- "Nuevo vs. recurrente" y el total gastado NO se guardan: se calculan de
-- `sales` (nunca se desincronizan).
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

alter table public.customers add column if not exists nombre text not null default '';
alter table public.customers add column if not exists telefono text;
alter table public.customers add column if not exists correo text;
alter table public.customers add column if not exists canal text
  check (canal in ('tienda_nube','tiktok_shop','mercado_libre','punto_fisico','otro'));
alter table public.customers add column if not exists notas text;
alter table public.customers add column if not exists tiendanube_customer_id bigint;
alter table public.customers add column if not exists updated_at timestamptz;

-- Un renglón por cliente de Tienda Nube (los capturados a mano quedan en null;
-- unique permite múltiples null).
create unique index if not exists customers_tn_uidx
  on public.customers(tiendanube_customer_id);
create index if not exists customers_nombre_idx on public.customers(nombre);

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch
  before update on public.customers
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: matriz común de módulos de negocio (interno ve y captura; gestor borra).
-- Reemplaza la policy "solo admin" que traía la tabla esqueleto.
-- ----------------------------------------------------------------------------
grant all on public.customers to authenticated, service_role;

alter table public.customers enable row level security;

drop policy if exists "clientes: leer (autenticados)" on public.customers;
drop policy if exists "clientes: solo admin" on public.customers;
drop policy if exists "customers: solo admin" on public.customers;

drop policy if exists "clientes: ver (interno)" on public.customers;
create policy "clientes: ver (interno)" on public.customers
  for select to authenticated using (public.es_interno());
drop policy if exists "clientes: crear (interno)" on public.customers;
create policy "clientes: crear (interno)" on public.customers
  for insert to authenticated with check (public.es_interno());
drop policy if exists "clientes: editar (interno)" on public.customers;
create policy "clientes: editar (interno)" on public.customers
  for update to authenticated using (public.es_interno()) with check (public.es_interno());
drop policy if exists "clientes: borrar (gestor)" on public.customers;
create policy "clientes: borrar (gestor)" on public.customers
  for delete to authenticated using (public.es_gestor());

notify pgrst, 'reload schema';

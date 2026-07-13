-- ============================================================================
-- Fresafit CRM — Integración Tienda Nube
-- ----------------------------------------------------------------------------
--   * products: columnas de mapeo (sku + IDs de producto/variante en Tienda
--     Nube) para que la sincronización sea idempotente: cada variante de
--     Tienda Nube es un renglón de `products`.
--   * integraciones: credenciales de servicios externos (access token de la
--     app privada). Sin policies: solo el service role la toca; el navegador
--     y los usuarios autenticados no la ven.
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

alter table public.products add column if not exists sku text;
alter table public.products add column if not exists tiendanube_product_id bigint;
alter table public.products add column if not exists tiendanube_variant_id bigint;

-- Una fila por variante de Tienda Nube (los productos manuales quedan en null;
-- unique permite múltiples null).
create unique index if not exists products_tn_variant_uidx
  on public.products(tiendanube_variant_id);
create index if not exists products_tn_product_idx
  on public.products(tiendanube_product_id);

-- ----------------------------------------------------------------------------
-- integraciones: una fila por servicio externo conectado (id = 'tiendanube').
-- ----------------------------------------------------------------------------
create table if not exists public.integraciones (
  id           text primary key,           -- 'tiendanube'
  access_token text not null,
  external_id  text not null,              -- store_id de Tienda Nube
  datos        jsonb not null default '{}'::jsonb,  -- última sync, conteos, etc.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

drop trigger if exists integraciones_touch on public.integraciones;
create trigger integraciones_touch
  before update on public.integraciones
  for each row execute function public.touch_updated_at();

-- RLS sin policies = nadie salvo service role (que las salta) puede leerla.
alter table public.integraciones enable row level security;
revoke all on public.integraciones from anon, authenticated;
grant all on public.integraciones to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Fresafit CRM — Fase 3: Finanzas y gastos (SOLO DIRECCIÓN)
-- ----------------------------------------------------------------------------
-- Es el único módulo con datos verdaderamente restringidos: nadie fuera de
-- dirección ve un solo renglón, ni un comprobante en Storage.
--   * expenses          — qué se gastó, cuánto, categoría y fecha.
--   * expense_receipts  — facturas/comprobantes (binario en Storage privado).
--   * bucket `facturas` — ruta <expense_id>/<archivo>, espejo del de adjuntos.
-- Los INGRESOS no se capturan: se derivan de `sales` (Fase 2). Entradas menos
-- salidas = saldo. Así nunca se captura una venta dos veces.
-- Reemplaza a la tabla esqueleto `finances` (vacía).
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

drop table if exists public.finances;

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null default current_date,
  concepto   text not null,                       -- qué se compró/pagó
  monto      numeric(12,2) not null check (monto >= 0),
  categoria  text not null default 'otro'
             check (categoria in ('marketing','producto','operacion','logistica','nomina','otro')),
  proveedor  text,                                -- a quién se le pagó (texto libre)
  notas      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists expenses_fecha_idx     on public.expenses(fecha);
create index if not exists expenses_categoria_idx on public.expenses(categoria);

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch
  before update on public.expenses
  for each row execute function public.touch_updated_at();

-- Comprobantes: metadatos aquí, binario en Storage (bucket `facturas`).
create table if not exists public.expense_receipts (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  nombre       text not null,
  storage_path text not null,
  tipo         text,
  created_at   timestamptz not null default now()
);
create index if not exists expense_receipts_expense_idx on public.expense_receipts(expense_id);

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- RLS: TODO restringido a dirección (es_admin() = rol 'direccion').
-- Sin policies para el resto = no ven ni una fila (RLS deniega por defecto).
-- ----------------------------------------------------------------------------
grant all on public.expenses, public.expense_receipts to authenticated, service_role;

alter table public.expenses         enable row level security;
alter table public.expense_receipts enable row level security;

drop policy if exists "gastos: solo direccion" on public.expenses;
create policy "gastos: solo direccion" on public.expenses
  for all to authenticated
  using (public.es_admin(auth.uid()))
  with check (public.es_admin(auth.uid()));

drop policy if exists "comprobantes: solo direccion" on public.expense_receipts;
create policy "comprobantes: solo direccion" on public.expense_receipts
  for all to authenticated
  using (public.es_admin(auth.uid()))
  with check (public.es_admin(auth.uid()));

-- Storage del bucket `facturas`: mismas reglas (los binarios son tan sensibles
-- como las filas). Se sirven con URLs firmadas de 1 hora.
drop policy if exists "facturas storage: ver (direccion)" on storage.objects;
create policy "facturas storage: ver (direccion)" on storage.objects
  for select to authenticated
  using (bucket_id = 'facturas' and public.es_admin(auth.uid()));

drop policy if exists "facturas storage: subir (direccion)" on storage.objects;
create policy "facturas storage: subir (direccion)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'facturas' and public.es_admin(auth.uid()));

drop policy if exists "facturas storage: borrar (direccion)" on storage.objects;
create policy "facturas storage: borrar (direccion)" on storage.objects
  for delete to authenticated
  using (bucket_id = 'facturas' and public.es_admin(auth.uid()));

notify pgrst, 'reload schema';

-- ============================================================================
-- Fresafit CRM — Row Level Security (RLS), GRANTs y refresco de caché
-- Idempotente: seguro de re-ejecutar.
-- Modelo baseline (ajustable con Armando):
--   * Todos los autenticados VEN todo el tablero (tablero compartido).
--   * Cualquiera crea y mueve/edita tareas.
--   * Borrar: solo la tarea propia (created_by) o un admin.
--   * Perfiles: visibles para todos; editables solo por su dueño o un admin.
--   * Tablas esqueleto (Fase 2): solo admin hasta construir cada módulo.
-- ============================================================================

-- ------------------------- GRANTs (exposición API) --------------------------
-- Sin estos grants, PostgREST oculta las tablas a anon/authenticated ("Could
-- not find the table in the schema cache"). RLS sigue gobernando las FILAS.
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on function public.es_admin(uuid) to anon, authenticated;

-- ------------------------- Habilitar RLS ------------------------------------
alter table public.profiles  enable row level security;
alter table public.tasks     enable row level security;
alter table public.customers enable row level security;
alter table public.orders    enable row level security;
alter table public.inventory enable row level security;
alter table public.finances  enable row level security;

-- ---------------------------- profiles --------------------------------------
drop policy if exists "perfiles: leer (autenticados)" on public.profiles;
create policy "perfiles: leer (autenticados)"
  on public.profiles for select
  to authenticated using (true);

drop policy if exists "perfiles: actualizar propio o admin" on public.profiles;
create policy "perfiles: actualizar propio o admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.es_admin(auth.uid()))
  with check (id = auth.uid() or public.es_admin(auth.uid()));

-- ------------------------------ tasks ---------------------------------------
drop policy if exists "tareas: leer (autenticados)" on public.tasks;
create policy "tareas: leer (autenticados)"
  on public.tasks for select
  to authenticated using (true);

drop policy if exists "tareas: crear (dueño = usuario actual)" on public.tasks;
create policy "tareas: crear (dueño = usuario actual)"
  on public.tasks for insert
  to authenticated with check (created_by = auth.uid());

drop policy if exists "tareas: editar/mover (tablero compartido)" on public.tasks;
create policy "tareas: editar/mover (tablero compartido)"
  on public.tasks for update
  to authenticated using (true) with check (true);

drop policy if exists "tareas: borrar propias o admin" on public.tasks;
create policy "tareas: borrar propias o admin"
  on public.tasks for delete
  to authenticated using (created_by = auth.uid() or public.es_admin(auth.uid()));

-- ------------------- tablas esqueleto: solo admin ---------------------------
drop policy if exists "customers: solo admin" on public.customers;
create policy "customers: solo admin" on public.customers
  for all to authenticated
  using (public.es_admin(auth.uid())) with check (public.es_admin(auth.uid()));

drop policy if exists "orders: solo admin" on public.orders;
create policy "orders: solo admin" on public.orders
  for all to authenticated
  using (public.es_admin(auth.uid())) with check (public.es_admin(auth.uid()));

drop policy if exists "inventory: solo admin" on public.inventory;
create policy "inventory: solo admin" on public.inventory
  for all to authenticated
  using (public.es_admin(auth.uid())) with check (public.es_admin(auth.uid()));

drop policy if exists "finances: solo admin" on public.finances;
create policy "finances: solo admin" on public.finances
  for all to authenticated
  using (public.es_admin(auth.uid())) with check (public.es_admin(auth.uid()));

-- ------------------- Refrescar caché de esquema de PostgREST ----------------
notify pgrst, 'reload schema';

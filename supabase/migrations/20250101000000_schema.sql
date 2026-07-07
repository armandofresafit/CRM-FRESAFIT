-- ============================================================================
-- Fresafit CRM — Esquema inicial
-- Módulo Tareas (Fase 1 migrada) + perfiles/auth + tablas esqueleto (Fase 2).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: 1:1 con auth.users. Es el "equipo" (antes constante EQUIPO).
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null default '',
  rol        text not null default 'miembro' check (rol in ('admin','miembro')),
  area       text check (area in ('operaciones','marketing','ventas','inventario','finanzas','general')),
  color      text not null default '#e84393',
  created_at timestamptz not null default now()
);

-- Helper: ¿el usuario es admin? SECURITY DEFINER para no disparar RLS recursivo
-- cuando se use dentro de las policies de `profiles`.
create or replace function public.es_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = uid and rol = 'admin');
$$;

-- Al registrarse un usuario en Auth, crear su perfil automáticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- tasks: el tablero Kanban (antes lista `tareas` en localStorage).
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descripcion    text,
  responsable_id uuid references public.profiles(id) on delete set null,
  area           text not null default 'general'   check (area in ('operaciones','marketing','ventas','inventario','finanzas','general')),
  prioridad      text not null default 'media'      check (prioridad in ('baja','media','alta','urgente')),
  estado         text not null default 'por_hacer'  check (estado in ('por_hacer','en_progreso','en_revision','hecho')),
  fecha_limite   date,
  orden          int  not null default 0,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

create index if not exists tasks_estado_idx      on public.tasks(estado);
create index if not exists tasks_responsable_idx on public.tasks(responsable_id);

-- Mantener updated_at al editar.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Tablas ESQUELETO para la Fase 2 (Clientes, Pedidos, Inventario, Finanzas).
-- Solo id + auditoría; las columnas de negocio se definen al construir cada módulo.
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.finances (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Fresafit CRM — Publicaciones de Mercado Libre por producto
-- ----------------------------------------------------------------------------
-- Mercado Libre puede tener VARIAS publicaciones sobre el mismo inventario: al
-- sumar un artículo a su catálogo crea una publicación "de catálogo" que comparte
-- bodega con la original. ML las agrupa con `user_product_id` (MLMU…) y ambas
-- mueven el mismo número.
--
-- El CRM las trataba como productos distintos (una fila por item_id), así que el
-- mismo artículo se contaba dos veces y las ventas se repartían entre dos fichas.
-- A partir de aquí:
--
--   * `products` guarda la publicación PRINCIPAL (meli_item_id) y la unidad de
--     inventario de ML (meli_user_product_id).
--   * `meli_publicaciones` guarda TODAS las publicaciones que apuntan a esa
--     ficha — la principal y las de catálogo. Es el mapa que usa la importación
--     de ventas para saber a qué producto pertenece una orden, venga por la
--     publicación que venga.
--
-- Incluye `fusionar_producto_ml`: une dos fichas que resultaron ser el mismo
-- artículo, moviendo ventas, movimientos y publicaciones a la que se queda.
--
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- products: unidad de inventario de ML + modalidad de envío de la publicación
-- ----------------------------------------------------------------------------
-- meli_user_product_id: "MLMU…", el artículo del vendedor en ML. Dos filas con
-- el mismo valor son el MISMO inventario físico (candidatas a fusionarse).
alter table public.products add column if not exists meli_user_product_id text;

-- meli_logistic_type: "fulfillment" (Mercado Full: la mercancía ya está en un
-- centro de ML), "cross_docking", "drop_off"… Es un dato de la publicación.
alter table public.products add column if not exists meli_logistic_type text;

create index if not exists products_meli_user_product_idx
  on public.products(meli_user_product_id)
  where meli_user_product_id is not null;

-- ----------------------------------------------------------------------------
-- meli_publicaciones: 1 producto → N publicaciones de Mercado Libre
-- ----------------------------------------------------------------------------
create table if not exists public.meli_publicaciones (
  id                   bigint generated always as identity primary key,
  meli_item_id         text not null,                -- "MLM123…"
  meli_variation_id    bigint,                       -- null = item sin variaciones
  producto_id          uuid not null references public.products(id) on delete cascade,
  meli_user_product_id text,                         -- "MLMU…" (unidad de inventario)
  principal            boolean not null default false,
  creado_en            timestamptz not null default now(),
  -- Llave natural de la unidad, idéntica a clave() en lib/mercadolibre/sync.ts.
  -- Es una columna real (generada) y no un índice sobre expresión para que el
  -- upsert de la sync pueda apuntarle con on_conflict.
  unidad text generated always as (meli_item_id || ':' || coalesce(meli_variation_id::text, '')) stored
);

-- Una publicación (item + variación) pertenece a UN solo producto.
create unique index if not exists meli_publicaciones_unidad_uidx
  on public.meli_publicaciones (unidad);
create index if not exists meli_publicaciones_producto_idx on public.meli_publicaciones(producto_id);
create index if not exists meli_publicaciones_user_product_idx
  on public.meli_publicaciones(meli_user_product_id)
  where meli_user_product_id is not null;

grant all on public.meli_publicaciones to authenticated, service_role;
alter table public.meli_publicaciones enable row level security;

-- Solo lectura para el equipo interno: quien escribe es la sync (service_role)
-- o el RPC de fusión (security definer).
drop policy if exists "meli publicaciones: ver (interno)" on public.meli_publicaciones;
create policy "meli publicaciones: ver (interno)" on public.meli_publicaciones
  for select to authenticated using (public.es_interno());

-- Backfill: lo que hoy vive en products es la publicación principal de cada ficha.
insert into public.meli_publicaciones (meli_item_id, meli_variation_id, producto_id, principal)
  select meli_item_id, meli_variation_id, id, true
    from public.products
   where meli_item_id is not null
on conflict (unidad) do nothing;

-- ----------------------------------------------------------------------------
-- fusionar_producto_ml(ganador, perdedor)
-- ----------------------------------------------------------------------------
-- Une dos fichas que son el mismo artículo. Todo lo que colgaba del perdedor
-- (ventas, movimientos de stock, renglones de pedidos a proveedor y sus
-- publicaciones de ML) pasa al ganador, y el perdedor se borra.
--
-- El stock NO se suma: las dos fichas venían reflejando el MISMO inventario
-- físico, así que sumarlas duplicaría el conteo. Se conserva el del ganador.
create or replace function public.fusionar_producto_ml(p_ganador uuid, p_perdedor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item_perdedor text;
  v_var_perdedor  bigint;
  v_user_product  text;
begin
  if not public.es_interno() then
    raise exception 'Solo el equipo interno puede fusionar productos.';
  end if;
  if p_ganador = p_perdedor then
    raise exception 'No se puede fusionar una ficha consigo misma.';
  end if;

  select meli_item_id, meli_variation_id, meli_user_product_id
    into v_item_perdedor, v_var_perdedor, v_user_product
    from public.products where id = p_perdedor
     for update;
  if not found then
    raise exception 'La ficha a fusionar ya no existe.';
  end if;
  if not exists (select 1 from public.products where id = p_ganador) then
    raise exception 'La ficha que debía quedarse ya no existe.';
  end if;

  -- Historial: se repunta al ganador para no perder ventas ni movimientos.
  update public.sales               set producto_id = p_ganador where producto_id = p_perdedor;
  update public.stock_log           set producto_id = p_ganador where producto_id = p_perdedor;
  update public.supplier_order_items set producto_id = p_ganador where producto_id = p_perdedor;

  -- Las publicaciones del perdedor pasan al ganador como secundarias (la
  -- principal del ganador no se toca).
  update public.meli_publicaciones
     set producto_id = p_ganador, principal = false
   where producto_id = p_perdedor;

  -- Si el ganador aún no tenía registrada la unidad de inventario, la hereda.
  update public.products
     set meli_user_product_id = coalesce(meli_user_product_id, v_user_product)
   where id = p_ganador;

  delete from public.products where id = p_perdedor;
end;
$$;

grant execute on function public.fusionar_producto_ml(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

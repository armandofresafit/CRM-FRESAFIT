-- ============================================================================
-- Fresafit CRM — Escritura segura de stock hacia los canales
-- ----------------------------------------------------------------------------
-- Dos piezas para que el CRM pueda volver a escribir sin repetir lo del 18/07,
-- cuando mandó a Tienda Nube un stock viejo y borró 27 unidades de movimientos.
--
--   1. stock_log.simulado — permite el modo SIMULACRO: el CRM calcula lo que
--      escribiría y lo anota, sin llamar a ninguna API. Así se mide si acierta
--      ANTES de darle permiso de escribir de verdad.
--
--   2. stock_locks + candado — el webhook, el cron y la importación de ventas
--      pueden tocar el mismo producto a la vez. Leer-calcular-escribir sin
--      serializar es una carrera: dos procesos leen 458, los dos restan 1, y el
--      resultado son 457 en vez de 456. Como la escritura al canal es HTTP (vive
--      fuera de la transacción de Postgres) no sirve pg_advisory_lock: hace
--      falta un candado cooperativo con vencimiento, para que un proceso que
--      muera no deje el producto bloqueado para siempre.
--
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Modo simulacro en el ledger
-- ----------------------------------------------------------------------------
-- true = el CRM decidió esta escritura pero NO la aplicó (estaba en simulacro).
-- Al comparar estas filas contra lo que después ocurrió de verdad en el canal
-- se mide la puntería del hub sin arriesgar una sola unidad.
alter table public.stock_log add column if not exists simulado boolean not null default false;

create index if not exists stock_log_simulado_idx
  on public.stock_log(creado_en desc)
  where simulado;

-- ----------------------------------------------------------------------------
-- 2) Candado cooperativo por producto
-- ----------------------------------------------------------------------------
create table if not exists public.stock_locks (
  producto_id uuid primary key references public.products(id) on delete cascade,
  expira_en   timestamptz not null,
  tomado_en   timestamptz not null default now()
);

grant all on public.stock_locks to authenticated, service_role;
alter table public.stock_locks enable row level security;
-- Sin policies: solo el service_role (que las salta) toca esta tabla. Es
-- maquinaria interna del hub, no información que nadie deba consultar.

-- Toma el candado si está libre o ya venció. Atómico: el INSERT … ON CONFLICT
-- resuelve la carrera dentro de una sola sentencia, así que dos procesos
-- simultáneos nunca se lo llevan los dos.
create or replace function public.tomar_candado_stock(p_producto uuid, p_segundos int default 30)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ok boolean;
begin
  insert into public.stock_locks (producto_id, expira_en, tomado_en)
       values (p_producto, now() + make_interval(secs => p_segundos), now())
  on conflict (producto_id) do update
          set expira_en = excluded.expira_en,
              tomado_en = excluded.tomado_en
        where public.stock_locks.expira_en < now()   -- solo si el anterior venció
    returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.liberar_candado_stock(p_producto uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.stock_locks where producto_id = p_producto;
$$;

grant execute on function public.tomar_candado_stock(uuid, int) to authenticated, service_role;
grant execute on function public.liberar_candado_stock(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) El descuento por venta devuelve lo que el hub necesita para escribir bien
-- ----------------------------------------------------------------------------
-- Reemplaza la versión de 20260722 añadiendo tres datos al resultado:
--   sku                → para la lista blanca de SKUs del piloto;
--   meli_logistic_type → para no escribir stock de Mercado Full;
--   descontado         → el MOVIMIENTO (unidades vendidas). Con él, el hub
--                        aplica "resta 2" sobre lo que el canal tenga de
--                        verdad, en vez de imponer un total calculado aquí.
-- La lógica de descuento no cambia.
--
-- Va con DROP porque Postgres no deja cambiar el tipo de retorno de una función
-- con CREATE OR REPLACE ("cannot change return type of existing function"), y
-- aquí el resultado gana columnas. Nadie la está llamando mientras tanto: el
-- hub de ventas solo corre con STOCK_HUB_VENTAS activo, que está apagado.
drop function if exists public.descontar_stock_ventas(jsonb, text);

create or replace function public.descontar_stock_ventas(items jsonb, p_origen text)
returns table (
  id                    uuid,
  sku                   text,
  stock                 int,
  descontado            int,
  tiendanube_product_id bigint,
  tiendanube_variant_id bigint,
  meli_item_id          text,
  meli_variation_id     bigint,
  meli_logistic_type    text
) language plpgsql security definer set search_path = public as $$
begin
  return query
  -- Suma cantidades por producto (un mismo producto puede venir en varias líneas).
  with ent as (
    select x.producto_id, sum(x.cantidad)::int as cantidad
      from jsonb_to_recordset(items) as x(producto_id uuid, cantidad int)
     where x.producto_id is not null and x.cantidad > 0
     group by x.producto_id
  ),
  -- Valor previo (snapshot pre-update) para el ledger.
  antes as (
    select p.id, p.stock as anterior, e.cantidad
      from public.products p
      join ent e on e.producto_id = p.id
  ),
  upd as (
    update public.products p
       set stock = greatest(0, p.stock - e.cantidad)
      from ent e
     where p.id = e.producto_id
    returning p.id, p.sku, p.stock as nuevo, e.cantidad as descontado,
              p.tiendanube_product_id, p.tiendanube_variant_id,
              p.meli_item_id, p.meli_variation_id, p.meli_logistic_type
  ),
  -- CTE modificadora: siempre corre a término aunque no se referencie.
  logged as (
    insert into public.stock_log (producto_id, canal, origen, stock_anterior, stock_nuevo)
      select u.id, 'crm', p_origen, a.anterior, u.nuevo
        from upd u
        join antes a on a.id = u.id
    returning 1
  )
  select u.id, u.sku, u.nuevo, u.descontado,
         u.tiendanube_product_id, u.tiendanube_variant_id,
         u.meli_item_id, u.meli_variation_id, u.meli_logistic_type
    from upd u;
end;
$$;

grant execute on function public.descontar_stock_ventas(jsonb, text) to service_role;

notify pgrst, 'reload schema';

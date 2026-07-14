-- ============================================================================
-- Fresafit CRM — Clientes: identificar por correo
-- ----------------------------------------------------------------------------
-- La API de Tienda Nube NO devuelve el objeto `customer` en sus órdenes (ni en
-- el listado ni al pedir una orden suelta): los datos del comprador llegan como
-- contact_name / contact_email / contact_phone. El correo es entonces la llave
-- natural para no duplicar clientes (viene en el 100% de las órdenes).
-- El índice NO es parcial a propósito: PostgREST solo infiere el ON CONFLICT de
-- un upsert con índices completos. Los NULL no chocan entre sí, así que los
-- clientes de mostrador sin correo conviven sin problema.
-- Idempotente: se puede pegar tal cual en el SQL Editor de Supabase.
-- ============================================================================

create unique index if not exists customers_correo_uidx on public.customers(correo);

notify pgrst, 'reload schema';

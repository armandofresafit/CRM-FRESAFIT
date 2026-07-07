-- ============================================================================
-- Fresafit CRM — Hardening de seguridad (hallazgos de revisión)
-- Idempotente. RLS es a nivel de FILA, no de COLUMNA; estos triggers cierran
-- dos huecos que RLS por sí solo no cubre.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) profiles: impedir que un NO-admin cambie su propio `rol` o `area`.
--    Sin esto, un miembro podía auto-promoverse a admin con:
--      PATCH /rest/v1/profiles?id=eq.<su-uid>  {"rol":"admin"}
--    (RLS permite editar la fila propia, pero no limita QUÉ columnas).
--    service_role (scripts de seed) y postgres sí pueden; los admins también.
-- ----------------------------------------------------------------------------
create or replace function public.proteger_columnas_profiles()
returns trigger
language plpgsql
as $$
begin
  -- SECURITY INVOKER (por defecto): current_user = rol real de la petición.
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or public.es_admin(auth.uid()) then
    return new; -- pueden cambiar todo
  end if;
  -- Resto (miembros): se conservan rol y área; el resto (nombre, color) sí cambia.
  new.rol := old.rol;
  new.area := old.area;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_columnas on public.profiles;
create trigger profiles_proteger_columnas
  before update on public.profiles
  for each row execute function public.proteger_columnas_profiles();

-- ----------------------------------------------------------------------------
-- 2) tasks: congelar `created_by` en updates. Sin esto, cualquiera podía
--    reasignarse la autoría de una tarea ajena (PATCH created_by := su-uid) y
--    luego borrarla, eludiendo "borrar solo propias o admin".
-- ----------------------------------------------------------------------------
create or replace function public.congelar_created_by()
returns trigger
language plpgsql
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists tasks_congelar_created_by on public.tasks;
create trigger tasks_congelar_created_by
  before update on public.tasks
  for each row execute function public.congelar_created_by();

notify pgrst, 'reload schema';

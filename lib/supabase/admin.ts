import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/* Cliente con service role (salta RLS). SOLO para código de servidor que corre
   sin sesión de usuario: webhooks y sincronización de Tienda Nube, crons.
   Nunca importarlo desde componentes de cliente. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

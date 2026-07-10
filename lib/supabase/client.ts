/* Cliente de Supabase para el NAVEGADOR (Client Components).
   Usa la anon key pública; el acceso real lo protege RLS en la base de datos. */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

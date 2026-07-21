/* Refresco de sesión + protección de rutas para el middleware de Next.
   Se ejecuta en cada request: renueva el token de Supabase y redirige a /login
   a quien no tenga sesión (salvo las rutas públicas de auth). */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* /api/tiendanube y /api/mercadolibre quedan fuera del gate de sesión: los
   webhooks llegan sin cookies (validan firma/origen adentro) y los
   conectar/callback verifican sesión por su cuenta.

   /api/inventario/foto igual: la dispara un programador externo cada hora (el
   plan Hobby de Vercel no da crons horarios) y llega sin cookies. Se lista la
   ruta exacta, no todo /api/inventario, para no abrir de más. Adentro exige
   CRON_SECRET o usuario interno, así que sin credencial responde 401. */
const RUTAS_PUBLICAS = [
  "/login",
  "/auth",
  "/api/tiendanube",
  "/api/mercadolibre",
  "/api/inventario/foto",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no meter lógica entre createServerClient y getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((r) => path.startsWith(r));

  // Redirige copiando las cookies de sesión ya refrescadas por getUser(); si no,
  // los tokens rotados se perderían y la sesión podría romperse.
  function redirigir(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }

  // Sin sesión y en ruta protegida → al login.
  if (!user && !esPublica) return redirigir("/login");

  // Con sesión y en el login → directo al tablero.
  if (user && path === "/login") return redirigir("/tareas");

  return supabaseResponse;
}

import { NextResponse } from "next/server";
import { usuarioActual, esInterno } from "@/lib/supabase/usuario-actual";
import { urlAutorizacion } from "@/lib/tiendanube/api";

/* Arranque del OAuth: manda al usuario a autorizar la app en Tienda Nube.
   Al aceptar, Tienda Nube redirige a /api/tiendanube/callback con el código. */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const { user, rol } = await usuarioActual();
  if (!user || !esInterno(rol)) return NextResponse.redirect(`${origin}/login`);
  return NextResponse.redirect(urlAutorizacion());
}

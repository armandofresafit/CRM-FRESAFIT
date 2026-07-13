import { NextResponse } from "next/server";
import { usuarioActual, esInterno } from "@/lib/supabase/usuario-actual";
import { guardarConexion, intercambiarCodigo, registrarWebhooksTN } from "@/lib/tiendanube/api";
import { sincronizacionCompleta } from "@/lib/tiendanube/sync";

/* Callback del OAuth de Tienda Nube: cambia el código (válido 5 minutos) por
   el access token, lo guarda, registra los webhooks e importa el catálogo. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const { user, rol } = await usuarioActual();
  if (!user || !esInterno(rol)) return NextResponse.redirect(`${origin}/login`);

  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/inventario?tiendanube=error`);

  try {
    const { token, storeId } = await intercambiarCodigo(code);
    await guardarConexion(token, storeId);

    // Tienda Nube solo acepta webhooks en URLs https públicas; en local se
    // omiten (el cron /api/tiendanube/sync los registra ya desplegado).
    let webhooks = "ok";
    if (origin.startsWith("https://") && !origin.includes("localhost")) {
      try {
        await registrarWebhooksTN({ token, storeId }, origin);
      } catch (e) {
        console.error("[tiendanube] registro de webhooks:", e);
        webhooks = "pendientes";
      }
    } else {
      webhooks = "pendientes";
    }

    const resumen = await sincronizacionCompleta({ token, storeId });
    return NextResponse.redirect(
      `${origin}/inventario?tiendanube=conectada&productos=${resumen.productos}&webhooks=${webhooks}`,
    );
  } catch (e) {
    console.error("[tiendanube] callback:", e);
    return NextResponse.redirect(`${origin}/inventario?tiendanube=error`);
  }
}

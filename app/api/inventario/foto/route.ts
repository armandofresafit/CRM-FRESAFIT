import { NextResponse } from "next/server";
import { usuarioActual, esInterno } from "@/lib/supabase/usuario-actual";
import { tomarFotoCanales } from "@/lib/inventario/foto-canales";

/* Foto del stock en los tres lados (CRM, Tienda Nube, Mercado Libre). Solo lee
   los canales: nunca les escribe.

   NO va en los crons de vercel.json: el plan Hobby admite 2 tareas programadas
   y solo una vez al día, y las dos están ocupadas por las syncs de Tienda Nube
   y Mercado Libre. La foto necesita correr cada hora, así que la dispara un
   programador externo (cron-job.org / GitHub Actions) llamando a esta ruta con
   `Authorization: Bearer <CRON_SECRET>`. Un usuario interno también puede
   dispararla a mano desde el navegador. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const esCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!esCron) {
    const { user, rol } = await usuarioActual();
    if (!user || !esInterno(rol)) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  try {
    return NextResponse.json({ ok: true, ...(await tomarFotoCanales()) });
  } catch (e) {
    console.error("[inventario] foto de canales:", e);
    const detalle = e instanceof Error ? e.message : "Falló la foto de inventario.";
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { usuarioActual, esInterno } from "@/lib/supabase/usuario-actual";
import { tomarFotoCanales } from "@/lib/inventario/foto-canales";
import { repararDesviaciones } from "@/lib/inventario/reparacion";

/* Foto del stock en los tres lados (CRM, Tienda Nube, Mercado Libre), y —solo
   para los productos del piloto y solo cuando se puede demostrar que el canal
   se quedó atrás— la reparación de lo que quedó descuadrado. Los criterios y su
   porqué están en lib/inventario/reparacion.ts. Todo lo demás es solo lectura.

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
    const { estables, ...foto } = await tomarFotoCanales();
    /* La reparación es diagnóstico y corrección de mantenimiento: si falla, la
       foto —que es el dato— ya está guardada y no debe perderse por ello. */
    let reparacion;
    try {
      reparacion = await repararDesviaciones(estables);
      for (const i of reparacion.incidencias) console.warn("[inventario] descuadre:", i);
    } catch (e) {
      console.error("[inventario] reparación:", e);
    }
    return NextResponse.json({ ok: true, ...foto, estables: estables.length, reparacion });
  } catch (e) {
    console.error("[inventario] foto de canales:", e);
    const detalle = e instanceof Error ? e.message : "Falló la foto de inventario.";
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}

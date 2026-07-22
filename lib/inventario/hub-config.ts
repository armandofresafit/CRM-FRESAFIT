/* ============================================================================
   lib/inventario/hub-config.ts — Interruptor del hub de stock por ventas
   ----------------------------------------------------------------------------
   Con el hub activo, una venta en cualquier canal descuenta el stock del CRM y
   el movimiento se empuja a los demás canales. El CRM pasa a ser la fuente de
   verdad del inventario.

   APAGADO por defecto (variable no definida) → el sistema se comporta como
   siempre: sin descuento por venta, con Tienda Nube dictando el stock y la
   adopción del de Mercado Libre intacta. Toda la infraestructura (el RPC
   descontar_stock_ventas, el hub) queda inerte.

   Para ACTIVARLO: definir STOCK_HUB_VENTAS=on en el entorno (Vercel) y redeploy.

   OJO — el flag es global, pero el PILOTO no debe serlo: mientras
   SYNC_ESCRITURA_SKUS tenga una lista, solo esos productos cambian de modelo y
   el resto del catálogo sigue funcionando exactamente como hoy. Por eso el
   descuento se filtra con `productosDelPiloto()`: sin ese filtro, encender el
   hub descontaría el stock local de los ~600 productos restantes, que siguen
   gobernados por Tienda Nube y quedarían con el número pisado dos veces.
   ============================================================================ */

import { createAdminClient } from "@/lib/supabase/admin";
import { skusHabilitados } from "@/lib/inventario/escritura-canales";

export const HUB_VENTAS_ACTIVO = process.env.STOCK_HUB_VENTAS === "on";

/* Filtra unos renglones (producto_id + cantidad) dejando solo los productos que
   están dentro del piloto. Sin lista blanca —la operación normal— no filtra
   nada y no cuesta ninguna consulta extra. */
export async function productosDelPiloto<T extends { producto_id: string }>(
  items: T[],
): Promise<T[]> {
  const skus = skusHabilitados();
  if (skus.size === 0 || items.length === 0) return items;

  const admin = createAdminClient();
  const ids = [...new Set(items.map((i) => i.producto_id))];
  const permitidos = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from("products")
      .select("id, sku")
      .in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      const sku = (p.sku as string | null)?.trim().toUpperCase();
      if (sku && skus.has(sku)) permitidos.add(p.id as string);
    }
  }
  return items.filter((i) => permitidos.has(i.producto_id));
}

/* ============================================================================
   lib/inventario/escritura-canales.ts — Interruptor de escritura a los canales
   ----------------------------------------------------------------------------
   El CRM es hoy SOLO LECTURA frente a Tienda Nube y Mercado Libre: importa
   catálogo, stock, precios y ventas, pero no modifica NADA allá. El inventario
   de cada plataforma se administra en la plataforma.

   APAGADO por defecto (variable no definida) → ninguna ruta del CRM escribe en
   el catálogo externo: ni stock (ajuste manual, propagación entre canales,
   descuento por venta) ni precio/costo. Los ajustes de stock del CRM quedan
   locales (tabla `products` + ledger `stock_log`).

   Para ACTIVARLO: definir SYNC_ESCRITURA_CANALES=on en el entorno (Vercel) y
   redeploy. El candado real vive en las dos únicas funciones que hacen PUT al
   catálogo — actualizarVarianteTN (Tienda Nube) y actualizarStockML (Mercado
   Libre) — así que ninguna ruta, presente o futura, puede escaparse de él.
   ============================================================================ */

export const ESCRITURA_CANALES = process.env.SYNC_ESCRITURA_CANALES === "on";

/* ============================================================================
   lib/inventario/reconciliacion.ts — Reporte de descuadres de inventario
   ----------------------------------------------------------------------------
   Lee el stock EN VIVO de cada canal (Tienda Nube y Mercado Libre) y lo compara
   contra el del CRM, para listar solo los productos que NO coinciden. Sirve para
   encontrar los artículos que quedaron descuadrados por escrituras automáticas
   viejas (cuando ML llegaba a pisar el stock de TN).

   Es SOLO LECTURA: no escribe nada en ningún lado ni corrige. La corrección se
   hace a mano con el ajuste +/− de la tabla, que es la vía autorizada.
   ============================================================================ */

import { createAdminClient } from "@/lib/supabase/admin";
import { conexionTiendanube, listarProductosTN } from "@/lib/tiendanube/api";
import { conexionMercadolibre, listarItemsML } from "@/lib/mercadolibre/api";
import { clave, unidadesDe } from "@/lib/mercadolibre/sync";
import { detectarDuplicadosML, type GrupoDuplicado } from "@/lib/inventario/duplicados-ml";
import { esFull } from "@/lib/inventario/reabastecimiento";

export type Descuadre = {
  id: string;
  nombre: string;
  variante: string | null;
  sku: string | null;
  stock_crm: number;
  /* null = el producto no está vinculado a ese canal. */
  stock_tn: number | null;
  stock_ml: number | null;
  /* Vinculado al canal pero la publicación ya no apareció en su catálogo
     (borrada, pausada o fuera de la cuenta conectada). */
  falta_en_tn: boolean;
  falta_en_ml: boolean;
};

type FilaCRM = {
  id: string;
  nombre: string;
  variante: string | null;
  sku: string | null;
  stock: number;
  tiendanube_variant_id: number | null;
  meli_item_id: string | null;
  meli_variation_id: number | null;
  meli_logistic_type: string | null;
};

export type ResumenReconciliacion = {
  revisados: number; // productos vinculados a algún canal que se compararon
  descuadres: Descuadre[];
  /* Fichas distintas del CRM que en realidad son el mismo artículo en ML
     (publicación original + gemela de catálogo, misma bodega). */
  duplicados: GrupoDuplicado[];
  tnConectada: boolean;
  mlConectada: boolean;
};

export async function reconciliarInventario(): Promise<ResumenReconciliacion> {
  const admin = createAdminClient();

  const [cxTN, cxML] = await Promise.all([conexionTiendanube(), conexionMercadolibre()]);
  if (!cxTN && !cxML) {
    throw new Error("No hay ningún canal conectado con el cual comparar.");
  }

  // Catálogo del CRM: solo productos activos y vinculados a algún canal.
  const { data, error } = await admin
    .from("products")
    .select(
      "id, nombre, variante, sku, stock, tiendanube_variant_id, meli_item_id, meli_variation_id, meli_logistic_type",
    )
    .eq("activo", true)
    .or("tiendanube_variant_id.not.is.null,meli_item_id.not.is.null")
    .order("nombre");
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as FilaCRM[];

  // Stock en vivo de cada canal (en paralelo; cada uno pagina su catálogo).
  const [productosTN, itemsML] = await Promise.all([
    cxTN ? listarProductosTN(cxTN) : Promise.resolve(null),
    cxML ? listarItemsML(cxML) : Promise.resolve(null),
  ]);

  /* Tienda Nube: variante → stock. `stock` null en TN significa "sin control de
     stock" (combos, bundles y personalizados, que se arman bajo pedido): no
     tiene inventario que comparar, pero SÍ existe en el canal. Por eso se
     registra aparte de `stockTN`, para no confundirlo con "ya no está". */
  const stockTN = new Map<number, number>();
  const sinControlTN = new Set<number>();
  for (const p of productosTN ?? []) {
    for (const v of p.variants) {
      if (typeof v.stock === "number") stockTN.set(v.id, Math.max(0, v.stock));
      else sinControlTN.add(v.id);
    }
  }

  // Mercado Libre: unidad (item + variación) → stock.
  const stockML = new Map<string, number>();
  for (const item of itemsML ?? []) {
    for (const u of unidadesDe(item)) stockML.set(clave(u.itemId, u.variationId), u.stock);
  }

  const descuadres: Descuadre[] = [];
  for (const f of filas) {
    const enTN = f.tiendanube_variant_id != null;
    /* Mercado Full: la mercancía está depositada en un centro de ML, no en la
       bodega. Su stock es de OTRO almacén, así que compararlo contra el del CRM
       (que refleja la bodega) marca un descuadre que no existe. Se omite. */
    const enML = f.meli_item_id != null && !esFull(f);

    // Solo se compara contra los canales conectados (si un canal no está
    // conectado no podemos afirmar nada de él).
    const tnVal = enTN && productosTN ? (stockTN.get(f.tiendanube_variant_id!) ?? null) : null;
    const mlVal = enML && itemsML ? (stockML.get(clave(f.meli_item_id!, f.meli_variation_id)) ?? null) : null;

    /* "Ya no está en el canal" ≠ "no lleva control de stock": lo segundo es
       normal en combos y personalizados y no es un descuadre. */
    const faltaEnTN =
      enTN && productosTN != null && tnVal === null && !sinControlTN.has(f.tiendanube_variant_id!);
    const faltaEnML = enML && itemsML != null && mlVal === null;

    const difiereTN = tnVal !== null && tnVal !== f.stock;
    const difiereML = mlVal !== null && mlVal !== f.stock;

    if (difiereTN || difiereML || faltaEnTN || faltaEnML) {
      descuadres.push({
        id: f.id,
        nombre: f.nombre,
        variante: f.variante,
        sku: f.sku,
        stock_crm: f.stock,
        stock_tn: enTN ? tnVal : null,
        stock_ml: enML ? mlVal : null,
        falta_en_tn: faltaEnTN,
        falta_en_ml: faltaEnML,
      });
    }
  }

  return {
    revisados: filas.length,
    descuadres,
    // Aprovecha el catálogo de ML que ya se leyó arriba: no cuesta otra pasada.
    duplicados: await detectarDuplicadosML(itemsML),
    tnConectada: !!cxTN,
    mlConectada: !!cxML,
  };
}

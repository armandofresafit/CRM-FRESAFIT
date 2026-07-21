/* ============================================================================
   lib/inventario/tipo-producto.ts — Clasificación automática del catálogo
   ----------------------------------------------------------------------------
   El SKU manda: es lo único estable entre Tienda Nube y Mercado Libre (los
   títulos de ML llevan cola de palabras clave: "Par De Straps Baki Manga Anime
   Gym Crossfit Pesas Blanco"). Prefijos reales del catálogo:

     SBD…   cinturón de powerlift (sublimado)   PRM…   cinturón de hebilla (premium)
     STR…   straps                              MQR…   muñequeras
     …OG    modelo VIEJO (≈$598); sin sufijo = modelo Pro (≈$698)

   El nombre solo es el respaldo para lo que no trae SKU o lo trae fuera de
   patrón (publicaciones sueltas de ML, altas a mano).

   Solo se usa al CREAR el renglón (importaciones de Tienda Nube y Mercado
   Libre); si luego lo reclasifican a mano, las syncs no lo pisan.
   ============================================================================ */

import type { TipoProductoId } from "@/lib/types";

/* ¿El SKU o el nombre marcan el modelo viejo? En el SKU es el sufijo OG
   (STR010OG); en el nombre, la palabra suelta ("Muñequeras Minato OG"). */
function esModeloViejo(sku: string, nombre: string): boolean {
  return /OG$/.test(sku) || /\bog\b/i.test(nombre);
}

export function tipoDesdeProducto(p: { nombre: string; sku?: string | null }): TipoProductoId {
  const sku = (p.sku ?? "").trim().toUpperCase();
  const nombre = p.nombre;
  const n = nombre.toLowerCase();
  const viejo = esModeloViejo(sku, nombre);

  /* 1) Por prefijo de SKU (la fuente confiable). */
  if (sku.startsWith("SBD")) return "cinturon_powerlift";
  if (sku.startsWith("PRM")) return "cinturon_hebilla";
  if (sku.startsWith("STR")) return viejo ? "straps_viejos" : "straps_pro";
  if (sku.startsWith("MQR")) return viejo ? "munequeras_viejos" : "munequeras_pro";

  /* 2) Por nombre. Los cinturones se distinguen por su palabra clave; "premium"
     es como ML titula los de hebilla ("Faja Cinto Premium Gym Pesas…"). */
  if (n.includes("powerlift")) return "cinturon_powerlift";
  if (n.includes("hebilla") || (n.includes("faja") && n.includes("premium"))) return "cinturon_hebilla";
  if (n.includes("strap")) return viejo ? "straps_viejos" : "straps_pro";
  if (n.includes("muñequ") || n.includes("munequ") || n.includes("wraps"))
    return viejo ? "munequeras_viejos" : "munequeras_pro";
  if (/mochila|maleta|morral|backpack|cangurera|crossbody/.test(n)) return "mochilas";
  if (/playera|camiseta|tank|sudadera|hoodie|short|legging|jogger|gorra|calceta|falda|bra\b|sweatpant|pump cover|chaqueta|top\b/.test(n))
    return "ropa";

  /* Combos, palancas, rodilleras y suplementos caen aquí a propósito: no son
     ninguna de las ocho líneas y se reclasifican a mano si hace falta. */
  return "otro";
}

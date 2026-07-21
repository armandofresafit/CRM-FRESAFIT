/* ============================================================================
   lib/inventario/duplicados-ml.ts — Fichas que son el mismo artículo en ML
   ----------------------------------------------------------------------------
   Mercado Libre puede tener varias publicaciones sobre el MISMO inventario: al
   sumar un artículo a su catálogo crea una publicación gemela que comparte
   bodega con la original (ML las agrupa con `user_product_id`). El CRM las
   importó como fichas separadas, así que el mismo artículo se cuenta dos veces
   y las ventas se reparten entre las dos.

   Aquí se DETECTAN esos grupos (solo lectura). Unirlos es una acción explícita
   del panel de Reconciliación: fusionarProductosML → RPC fusionar_producto_ml.
   ============================================================================ */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ItemML } from "@/lib/mercadolibre/api";
import { unidadesDe } from "@/lib/mercadolibre/sync";

export type FichaDuplicada = {
  id: string;
  nombre: string;
  sku: string | null;
  stock: number;
  activo: boolean;
  meli_item_id: string | null;
  en_tiendanube: boolean;
  ventas: number;
};

export type GrupoDuplicado = {
  /* Artículo del vendedor en ML ("MLMU…"): la bodega que comparten. */
  user_product_id: string;
  /* Lo que ML reporta para esa bodega (las publicaciones siempre coinciden). */
  stock_ml: number | null;
  fichas: FichaDuplicada[];
  /* Ficha que debería quedarse: la vinculada a Tienda Nube, porque TN es el
     padre del inventario. null = no hay una obvia (ninguna o varias vinculadas)
     y conviene revisarlo a mano antes de unir. */
  ganador_id: string | null;
};

type FilaCRM = {
  id: string;
  nombre: string;
  sku: string | null;
  stock: number;
  activo: boolean;
  tiendanube_variant_id: number | null;
  meli_item_id: string | null;
};

/* Recibe el catálogo de ML ya leído (lo trae la reconciliación) para no pedirlo
   dos veces. Sin items → sin grupos. */
export async function detectarDuplicadosML(itemsML: ItemML[] | null): Promise<GrupoDuplicado[]> {
  if (!itemsML?.length) return [];
  const admin = createAdminClient();

  // Publicaciones agrupadas por la bodega que comparten.
  const porUnidadInv = new Map<string, ItemML[]>();
  for (const item of itemsML) {
    const up = item.user_product_id;
    if (!up) continue; // publicaciones viejas sin artículo de vendedor
    porUnidadInv.set(up, [...(porUnidadInv.get(up) ?? []), item]);
  }
  const compartidas = [...porUnidadInv.entries()].filter(([, items]) => items.length > 1);
  if (compartidas.length === 0) return [];

  /* Fichas del CRM de esas publicaciones. Se incluyen las INACTIVAS: el
     duplicado existe igual y hay que unirlo (la publicación gemela suele quedar
     activa mientras la original está pausada). */
  const itemIds = compartidas.flatMap(([, items]) => items.map((i) => i.id));
  const filas = new Map<string, FilaCRM>(); // meli_item_id → fila
  for (let i = 0; i < itemIds.length; i += 100) {
    const { data, error } = await admin
      .from("products")
      .select("id, nombre, sku, stock, activo, tiendanube_variant_id, meli_item_id")
      .in("meli_item_id", itemIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as FilaCRM[]) filas.set(f.meli_item_id!, f);
  }

  // Ventas por ficha: es el historial que la fusión va a mover, así que se
  // muestra para que quien decide sepa qué está en juego.
  const idsFichas = [...new Set([...filas.values()].map((f) => f.id))];
  const ventas = new Map<string, number>();
  for (let i = 0; i < idsFichas.length; i += 100) {
    const { data, error } = await admin
      .from("sales")
      .select("producto_id")
      .in("producto_id", idsFichas.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const v of data ?? []) {
      const id = v.producto_id as string;
      ventas.set(id, (ventas.get(id) ?? 0) + 1);
    }
  }

  const grupos: GrupoDuplicado[] = [];
  for (const [userProductId, items] of compartidas) {
    // Fichas distintas del grupo (dos publicaciones pueden apuntar ya a la misma).
    const delGrupo = new Map<string, FichaDuplicada>();
    for (const item of items) {
      const f = filas.get(item.id);
      if (!f || delGrupo.has(f.id)) continue;
      delGrupo.set(f.id, {
        id: f.id,
        nombre: f.nombre,
        sku: f.sku,
        stock: f.stock,
        activo: f.activo,
        meli_item_id: f.meli_item_id,
        en_tiendanube: f.tiendanube_variant_id != null,
        ventas: ventas.get(f.id) ?? 0,
      });
    }
    if (delGrupo.size < 2) continue; // ya está unificado

    const fichas = [...delGrupo.values()];
    const enTN = fichas.filter((f) => f.en_tiendanube);
    grupos.push({
      user_product_id: userProductId,
      stock_ml: unidadesDe(items[0])[0]?.stock ?? null,
      fichas,
      ganador_id: enTN.length === 1 ? enTN[0].id : null,
    });
  }

  // Primero los que se pueden unir sin pensarlo, y dentro de esos los que más
  // historial mueven.
  return grupos.sort((a, b) => {
    if (!!a.ganador_id !== !!b.ganador_id) return a.ganador_id ? -1 : 1;
    const vA = a.fichas.reduce((s, f) => s + f.ventas, 0);
    const vB = b.fichas.reduce((s, f) => s + f.ventas, 0);
    return vB - vA;
  });
}

/* ============================================================================
   lib/inventario/escritura-canales.ts — Qué puede escribir el CRM, y dónde
   ----------------------------------------------------------------------------
   El CRM nació escribiendo stock en Tienda Nube y Mercado Libre a la vez que
   Astroselling. Dos escritores mandando VALORES ABSOLUTOS leídos en momentos
   distintos se pisan: el 18/07 el CRM devolvió a Tienda Nube un stock de tres
   días antes y borró 27 unidades de movimientos. Desde entonces, solo lectura.

   El camino de vuelta no es un interruptor de todo o nada, sino tres niveles:

     SYNC_ESCRITURA_CANALES
       (sin definir) → off        el CRM no escribe en ningún lado. El default.
       simulacro                  calcula lo que escribiría y lo deja anotado en
                                  el ledger, sin llamar a ninguna API. Sirve
                                  para medir aciertos antes de encender.
       tiendanube,mercadolibre    lista de canales donde SÍ escribe.

     SYNC_ESCRITURA_SKUS
       (vacío)                    todos los productos del canal habilitado.
       MQR011,STR015,…            solo esos SKUs. Es lo que permite el piloto:
                                  encender la escritura en unos pocos productos
                                  ya excluidos en Astroselling, sin tocar el
                                  resto del catálogo.

   Cambiarlo es editar variables en Vercel y redesplegar: no hay que tocar
   código para avanzar ni para dar marcha atrás.
   ============================================================================ */

export type CanalEscritura = "tiendanube" | "mercadolibre" | "tiktok";

export type ModoEscritura = "off" | "simulacro" | "canales";

const TODOS: CanalEscritura[] = ["tiendanube", "mercadolibre", "tiktok"];

function crudo(): string {
  return (process.env.SYNC_ESCRITURA_CANALES ?? "").trim().toLowerCase();
}

export function modoEscritura(): ModoEscritura {
  const v = crudo();
  if (!v || v === "off" || v === "no" || v === "false") return "off";
  if (v === "simulacro" || v === "dry-run" || v === "dryrun") return "simulacro";
  return "canales";
}

/* Canales habilitados. En simulacro se devuelven todos: la gracia es medir qué
   escribiría en cada uno. `on` se acepta como "todos" para no romper la
   configuración vieja, que era un booleano. */
export function canalesHabilitados(): Set<CanalEscritura> {
  const modo = modoEscritura();
  if (modo === "off") return new Set();
  const v = crudo();
  if (modo === "simulacro" || v === "on" || v === "si" || v === "true" || v === "todos") {
    return new Set(TODOS);
  }
  const lista = v.split(/[,\s]+/).filter(Boolean);
  return new Set(TODOS.filter((c) => lista.includes(c)));
}

/* Lista blanca de SKUs. Vacía = sin restricción. */
export function skusHabilitados(): Set<string> {
  const v = (process.env.SYNC_ESCRITURA_SKUS ?? "").trim();
  if (!v) return new Set();
  return new Set(
    v
      .split(/[,\s]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean),
  );
}

/* ¿Se puede tocar este producto en este canal? Un producto sin SKU nunca entra
   en un piloto: no habría forma de nombrarlo en la lista. */
export function puedeEscribir(canal: CanalEscritura, sku: string | null | undefined): boolean {
  if (!canalesHabilitados().has(canal)) return false;
  const skus = skusHabilitados();
  if (skus.size === 0) return true;
  return !!sku && skus.has(sku.trim().toUpperCase());
}

/* ¿Las escrituras se aplican de verdad, o solo se anotan? */
export function esSimulacro(): boolean {
  return modoEscritura() === "simulacro";
}

/* Candado de las dos funciones que hacen PUT al catálogo externo
   (actualizarVarianteTN y actualizarStockML). En simulacro es `false` a
   propósito: esas funciones NO deben llegar a la API. */
export const ESCRITURA_CANALES = modoEscritura() === "canales";

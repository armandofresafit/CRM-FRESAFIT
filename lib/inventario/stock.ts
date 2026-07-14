/* ============================================================================
   lib/inventario/stock.ts  —  Semáforo de stock (Fresafit CRM)
   ----------------------------------------------------------------------------
   "Stock bajo" a secas mezclaba dos cosas muy distintas: lo que YA se acabó
   (cientos de variantes agotadas en la tienda) y lo que ESTÁ POR acabarse (lo
   accionable: hay que pedirlo al proveedor). Se separan.
   ============================================================================ */

export type EstadoStock = "agotado" | "por_acabarse" | "ok";

export const ESTADOS_STOCK = [
  { id: "por_acabarse", nombre: "Por acabarse", color: "#f59e0b" }, // ámbar
  { id: "agotado", nombre: "Agotado", color: "#d63031" },           // rojo
  { id: "ok", nombre: "Con stock", color: "#22c55e" },              // verde
] as const;

type ProductoStock = { stock: number; stock_minimo: number; activo: boolean };

/* Los productos inactivos no alertan: están fuera del catálogo a propósito. */
export function estadoStock(p: ProductoStock): EstadoStock {
  if (!p.activo) return "ok";
  if (p.stock === 0) return "agotado";
  if (p.stock <= p.stock_minimo) return "por_acabarse";
  return "ok";
}

export function obtenerEstadoStock(id: string) {
  return ESTADOS_STOCK.find((e) => e.id === id) ?? null;
}

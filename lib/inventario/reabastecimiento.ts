/* ============================================================================
   lib/inventario/reabastecimiento.ts — ¿Qué hay que pedir y para cuándo?
   ----------------------------------------------------------------------------
   Cruza tres cosas que hasta ahora vivían separadas: lo que se vende (`sales`),
   lo que hay (`products`) y lo que tarda en llegar un pedido (`suppliers`).

   Dos reglas de negocio que explican por qué esto no es un simple
   "stock <= stock_minimo" (lo que hace lib/inventario/stock.ts):

   1. UN SKU NO ES UN RENGLÓN. El mismo producto vive como publicación de Tienda
      Nube y como una (o dos) de Mercado Libre, y cada una reporta su propio
      stock del MISMO inventario físico. Sumarlos duplicaría (466 + 467 = 933),
      así que la bodega se toma como el MAYOR de los renglones no-Full. Las
      ventas, en cambio, sí se suman: son eventos distintos.

   2. MERCADO FULL ES OTRO ALMACÉN. El stock de una publicación `fulfillment` ya
      está depositado en un centro de Mercado Libre: no se puede usar para
      surtir Tienda Nube y no hay que pedirlo al proveedor, hay que ENVIARLO
      desde la bodega. Por eso se suma aparte y tiene su propio aviso.

   Módulo puro (sin I/O ni env directo): los parámetros llegan como argumento
   para que el panel pueda recalcular en el navegador al cambiar la ventana o la
   plataforma. `paramsReordenDesdeEnv()` solo se llama desde el servidor.
   ============================================================================ */

import { diasDesdeHoy } from "@/lib/fecha";
import type { CanalId, ProductConProveedor, TipoProductoId } from "@/lib/types";

/* --- Parámetros del cálculo (env en el servidor, prop en el cliente) --- */
export type ParamsReorden = {
  /* Días que tarda un pedido cuando el proveedor no tiene el suyo capturado. */
  diasEntregaDefault: number;
  /* Días de bodega → centro de Mercado Full. */
  diasEnvioFull: number;
  /* Margen de seguridad: nadie quiere que el pedido llegue justo el día que se
     agota (los tiempos de aduana se mueven). */
  diasColchon: number;
  /* Cuánto queremos que dure el pedido una vez que llegue. */
  diasCoberturaObjetivo: number;
};

export const PARAMS_REORDEN_DEFAULT: ParamsReorden = {
  diasEntregaDefault: 45,
  diasEnvioFull: 7,
  diasColchon: 10,
  diasCoberturaObjetivo: 60,
};

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : porDefecto;
}

/* Solo servidor: las variables sin NEXT_PUBLIC_ no existen en el navegador. */
export function paramsReordenDesdeEnv(): ParamsReorden {
  return {
    diasEntregaDefault: entero(process.env.REORDEN_DIAS_ENTREGA, PARAMS_REORDEN_DEFAULT.diasEntregaDefault),
    diasEnvioFull: entero(process.env.REORDEN_DIAS_FULL, PARAMS_REORDEN_DEFAULT.diasEnvioFull),
    diasColchon: entero(process.env.REORDEN_DIAS_COLCHON, PARAMS_REORDEN_DEFAULT.diasColchon),
    diasCoberturaObjetivo: entero(
      process.env.REORDEN_DIAS_COBERTURA,
      PARAMS_REORDEN_DEFAULT.diasCoberturaObjetivo,
    ),
  };
}

/* --- Entradas --- */

/* Venta reducida a lo que importa para la velocidad de salida. */
export type VentaReorden = {
  fecha: string; // "AAAA-MM-DD"
  canal: CanalId;
  cantidad: number;
  producto_id: string | null;
};

/* Unidades pedidas a proveedor que aún no llegan, por producto. */
export type EnCamino = Record<string, number>;

/* --- Salida --- */

export type UrgenciaReorden = "pedir_ya" | "pedir_pronto" | "ok" | "sin_ventas";

export const URGENCIAS = [
  { id: "pedir_ya", nombre: "Pedir ya", color: "#d63031" },
  { id: "pedir_pronto", nombre: "Pedir pronto", color: "#f59e0b" },
  { id: "ok", nombre: "Alcanza", color: "#22c55e" },
  { id: "sin_ventas", nombre: "Sin ventas", color: "#94a3b8" },
] as const;

/* Para ordenar la tabla: primero lo que urge. */
const PESO_URGENCIA: Record<UrgenciaReorden, number> = {
  pedir_ya: 0,
  pedir_pronto: 1,
  ok: 2,
  sin_ventas: 3,
};

export function obtenerUrgencia(id: string) {
  return URGENCIAS.find((u) => u.id === id) ?? null;
}

export type GrupoReorden = {
  clave: string; // SKU, o "id:<uuid>" para los renglones sin SKU
  sku: string | null;
  nombre: string;
  variante: string | null;
  tipo: TipoProductoId;
  proveedor: { id: string; nombre: string } | null;
  /* Renglón que representa al grupo (el de Tienda Nube si existe): es al que se
     le suma el stock cuando llega un pedido a proveedor. */
  productoId: string;
  productoIds: string[]; // todos los renglones que se agruparon
  enTiendaNube: boolean;
  enMercadoLibre: boolean;

  stockBodega: number;
  stockFull: number;
  stockTotal: number;
  enCamino: number;

  unidades: number; // vendidas en la ventana (con el filtro de plataforma)
  unidadesML: number;
  demandaDiaria: number;
  diasEntrega: number;
  diasCobertura: number | null; // null = no se vendió nada en la ventana
  puntoReorden: number;
  sugerido: number;
  pedirAntesDe: string | null; // "AAAA-MM-DD"
  urgencia: UrgenciaReorden;

  /* Mercado Full (solo si alguno de los renglones es `fulfillment`). */
  enFull: boolean;
  coberturaFull: number | null;
  enviarAFull: boolean;
  sugeridoAFull: number;
};

const LOGISTICA_FULL = "fulfillment";

/* ¿El renglón es una publicación de Mercado Full? */
export function esFull(p: { meli_logistic_type?: string | null }): boolean {
  return p.meli_logistic_type === LOGISTICA_FULL;
}

/* Producto con lo mínimo que necesita el cálculo (acepta ProductConProveedor). */
type ProductoReorden = Pick<
  ProductConProveedor,
  | "id"
  | "nombre"
  | "variante"
  | "sku"
  | "tipo"
  | "stock"
  | "activo"
  | "meli_item_id"
  | "meli_logistic_type"
  | "tiendanube_variant_id"
  | "proveedor"
>;

/* El título de Mercado Libre viene con cola de palabras clave ("Par De Straps
   Baki Manga Anime Gym Crossfit Pesas Blanco"); el de Tienda Nube es el nombre
   que usa el equipo ("Straps Baki Manga Pro"). Para el grupo se prefiere el de
   Tienda Nube y, si no hay, el más corto. */
function mejorRenglon(renglones: ProductoReorden[]): ProductoReorden {
  const deTN = renglones.filter((p) => p.tiendanube_variant_id != null);
  const candidatos = deTN.length > 0 ? deTN : renglones;
  return candidatos.reduce((a, b) => (b.nombre.length < a.nombre.length ? b : a));
}

export type OpcionesReabastecimiento = {
  productos: ProductoReorden[];
  ventas: VentaReorden[];
  enCamino?: EnCamino;
  /* Ventana de ventas en días (30 / 60 / 90). */
  ventanaDias: number;
  /* "todas" o un canal concreto: acota qué ventas cuentan como demanda. */
  canal?: CanalId | "todas";
  params?: ParamsReorden;
};

export function calcularReabastecimiento({
  productos,
  ventas,
  enCamino = {},
  ventanaDias,
  canal = "todas",
  params = PARAMS_REORDEN_DEFAULT,
}: OpcionesReabastecimiento): GrupoReorden[] {
  const activos = productos.filter((p) => p.activo);

  /* 1) Agrupar renglones por SKU (los que no tienen, por su propio id). */
  const grupos = new Map<string, ProductoReorden[]>();
  const claveDe = new Map<string, string>(); // producto_id → clave del grupo
  for (const p of activos) {
    const clave = p.sku?.trim() ? p.sku.trim().toUpperCase() : `id:${p.id}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
    claveDe.set(p.id, clave);
  }

  /* 2) Ventas de la ventana, sumadas por grupo. */
  const desde = diasDesdeHoy(-ventanaDias);
  const vendidas = new Map<string, { total: number; ml: number }>();
  for (const v of ventas) {
    if (!v.producto_id || v.fecha < desde) continue;
    if (canal !== "todas" && v.canal !== canal) continue;
    const clave = claveDe.get(v.producto_id);
    if (!clave) continue; // producto borrado o inactivo
    const acc = vendidas.get(clave) ?? { total: 0, ml: 0 };
    acc.total += v.cantidad;
    if (v.canal === "mercado_libre") acc.ml += v.cantidad;
    vendidas.set(clave, acc);
  }

  /* 3) Un renglón de reorden por grupo. */
  const filas: GrupoReorden[] = [];
  for (const [clave, renglones] of grupos) {
    const cabeza = mejorRenglon(renglones);
    const enFullRenglones = renglones.filter(esFull);

    // Bodega: el MAYOR de los no-Full (mismo inventario publicado en dos lados).
    // Full: la SUMA (cada publicación tiene su propio depósito en ML).
    const noFull = renglones.filter((p) => !esFull(p));
    const stockBodega = noFull.reduce((max, p) => Math.max(max, p.stock), 0);
    const stockFull = enFullRenglones.reduce((a, p) => a + p.stock, 0);
    const stockTotal = stockBodega + stockFull;

    const ventasGrupo = vendidas.get(clave) ?? { total: 0, ml: 0 };
    const camino = renglones.reduce((a, p) => a + (enCamino[p.id] ?? 0), 0);

    const diasEntrega = cabeza.proveedor?.dias_entrega ?? params.diasEntregaDefault;

    const demandaDiaria = ventanaDias > 0 ? ventasGrupo.total / ventanaDias : 0;
    const demandaML = ventanaDias > 0 ? ventasGrupo.ml / ventanaDias : 0;

    const diasCobertura = demandaDiaria > 0 ? stockTotal / demandaDiaria : null;
    const puntoReorden = demandaDiaria * (diasEntrega + params.diasColchon);
    const sugerido = Math.max(
      0,
      Math.ceil(
        demandaDiaria * (diasEntrega + params.diasCoberturaObjetivo) - stockTotal - camino,
      ),
    );

    let urgencia: UrgenciaReorden;
    if (demandaDiaria === 0) urgencia = "sin_ventas";
    else if (stockTotal + camino <= puntoReorden) urgencia = "pedir_ya";
    else if (stockTotal + camino <= puntoReorden * 1.5) urgencia = "pedir_pronto";
    else urgencia = "ok";

    // Fecha límite para pedir: cuando la cobertura baje al tiempo de entrega.
    const pedirAntesDe =
      diasCobertura === null
        ? null
        : diasDesdeHoy(Math.max(0, Math.floor(diasCobertura - diasEntrega - params.diasColchon)));

    // Full: se reabastece desde la bodega, con su propio (y mucho más corto) plazo.
    const enFull = enFullRenglones.length > 0;
    const coberturaFull = enFull && demandaML > 0 ? stockFull / demandaML : null;
    const enviarAFull =
      enFull && coberturaFull !== null && coberturaFull < params.diasEnvioFull + params.diasColchon;
    const sugeridoAFull = enviarAFull
      ? Math.min(
          stockBodega,
          Math.max(
            0,
            Math.ceil(
              demandaML * (params.diasEnvioFull + params.diasCoberturaObjetivo / 2) - stockFull,
            ),
          ),
        )
      : 0;

    filas.push({
      clave,
      sku: cabeza.sku,
      nombre: cabeza.nombre,
      variante: cabeza.variante,
      tipo: cabeza.tipo,
      proveedor: cabeza.proveedor,
      productoId: cabeza.id,
      productoIds: renglones.map((p) => p.id),
      enTiendaNube: renglones.some((p) => p.tiendanube_variant_id != null),
      enMercadoLibre: renglones.some((p) => p.meli_item_id != null),
      stockBodega,
      stockFull,
      stockTotal,
      enCamino: camino,
      unidades: ventasGrupo.total,
      unidadesML: ventasGrupo.ml,
      demandaDiaria,
      diasEntrega,
      diasCobertura,
      puntoReorden,
      sugerido,
      pedirAntesDe,
      urgencia,
      enFull,
      coberturaFull,
      enviarAFull,
      sugeridoAFull,
    });
  }

  /* 4) Lo que urge, primero; a igual urgencia, lo que menos dura. */
  return filas.sort((a, b) => {
    const peso = PESO_URGENCIA[a.urgencia] - PESO_URGENCIA[b.urgencia];
    if (peso !== 0) return peso;
    const ca = a.diasCobertura ?? Infinity;
    const cb = b.diasCobertura ?? Infinity;
    if (ca !== cb) return ca - cb;
    return b.unidades - a.unidades;
  });
}

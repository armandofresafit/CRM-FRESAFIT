"use client";

import { useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { obtenerTipoProducto } from "@/lib/catalogos";
import { estadoStock } from "@/lib/inventario/stock";
import { formatearMXN } from "@/lib/moneda";
import { ajustarStock } from "@/app/(app)/inventario/actions";
import type { ProductConProveedor } from "@/lib/types";
import { TablaSimple, filaSimpleClases } from "@/components/compartido/tabla-simple";
import { cn } from "@/lib/utils";

const COLS = "grid-cols-[minmax(180px,1fr)_120px_140px_100px_100px_215px]";

/* Pastilla suave: fondo del color del tipo al 12% de opacidad + texto sólido
   (en vez de fondo sólido + texto blanco), para verse ligera junto a las
   demás celdas de la tabla. */
function PastillaTipo({ tipo }: { tipo: string }) {
  const t = obtenerTipoProducto(tipo);
  if (!t) return null;
  return (
    <span
      className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: `${t.color}1F`, color: t.color }}
    >
      {t.nombre}
    </span>
  );
}

export function TablaProductos({
  productos,
  busqueda,
  filtroTipo,
  filtroStock,
  onEditar,
}: {
  productos: ProductConProveedor[];
  busqueda: string;
  filtroTipo: string;
  filtroStock: string; // "todos" | agotado | por_acabarse | ok
  onEditar: (p: ProductConProveedor) => void;
}) {
  const [, startTransition] = useTransition();

  function cambiarStock(p: ProductConProveedor, delta: number) {
    const nuevo = p.stock + delta;
    if (nuevo < 0) return;
    startTransition(async () => {
      try {
        const r = await ajustarStock(p.id, nuevo);
        if ("error" in r) toast.error(r.error);
      } catch {
        toast.error("No se pudo ajustar el stock. Revisa tu conexión.");
      }
    });
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = productos.filter(
    (p) =>
      (filtroTipo === "todos" || p.tipo === filtroTipo) &&
      (filtroStock === "todos" || estadoStock(p) === filtroStock) &&
      (!q ||
        p.nombre.toLowerCase().includes(q) ||
        (p.variante ?? "").toLowerCase().includes(q) ||
        (p.proveedor?.nombre ?? "").toLowerCase().includes(q)),
  );

  return (
    <div>
      {visibles.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          {productos.length === 0
            ? "Aún no hay productos. Da de alta el primero con «+ Nuevo producto»."
            : "Ningún producto coincide con la búsqueda."}
        </p>
      ) : (
        <TablaSimple
          cols={COLS}
          encabezados={["Producto", "Tipo", "Proveedor", "Costo", "Precio", "Stock"]}
          minW="min-w-[890px]"
        >
          {visibles.map((p) => {
            const estado = estadoStock(p);
            return (
              <div key={p.id} className={filaSimpleClases(COLS, !p.activo ? "opacity-50" : undefined)}>
                {/* Producto */}
                <button
                  type="button"
                  onClick={() => onEditar(p)}
                  className="truncate text-left font-medium hover:underline"
                  title={`${p.nombre}${p.variante ? ` — ${p.variante}` : ""}`}
                >
                  {p.nombre}
                  {p.variante && <span className="ml-1.5 text-muted-foreground">· {p.variante}</span>}
                  {!p.activo && <span className="ml-1.5 text-xs italic text-muted-foreground">(inactivo)</span>}
                </button>

                <div>
                  <PastillaTipo tipo={p.tipo} />
                </div>

                <div className="truncate">
                  {p.proveedor?.nombre ?? <span className="text-muted-foreground/50">—</span>}
                </div>

                <div>{formatearMXN(p.costo)}</div>
                <div>{formatearMXN(p.precio)}</div>

                {/* Stock con ajuste rápido */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => cambiarStock(p, -1)}
                    disabled={p.stock === 0}
                    className="flex size-6 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:opacity-40"
                    aria-label={`Restar 1 al stock de ${p.nombre}`}
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span
                    className={cn(
                      "min-w-8 text-center font-semibold tabular-nums",
                      estado === "agotado" && "text-red-600",
                      estado === "por_acabarse" && "text-amber-600",
                    )}
                  >
                    {p.stock}
                  </span>
                  <button
                    type="button"
                    onClick={() => cambiarStock(p, 1)}
                    className="flex size-6 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent"
                    aria-label={`Sumar 1 al stock de ${p.nombre}`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                  {estado === "agotado" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:bg-red-950 dark:text-red-300">
                      <span className="size-1.5 rounded-full bg-red-500" />
                      Agotado
                    </span>
                  ) : estado === "por_acabarse" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      <span className="size-1.5 rounded-full bg-amber-500" />
                      Por acabarse
                    </span>
                  ) : (
                    p.activo && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700 dark:bg-green-950 dark:text-green-300">
                        <span className="size-1.5 rounded-full bg-green-500" />
                        OK
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </TablaSimple>
      )}
    </div>
  );
}

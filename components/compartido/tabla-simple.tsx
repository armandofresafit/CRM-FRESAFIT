import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Tabla ligera compartida (patrón visual de la vista de tabla de Tareas):
   contenedor con scroll horizontal + encabezado de columnas. Las filas las
   pinta cada módulo con `filaSimpleClases(cols)` para compartir el grid. */
export function TablaSimple({
  cols,
  encabezados,
  titulo,
  minW = "min-w-[760px]",
  children,
}: {
  cols: string; // clase grid-cols-[...] común a encabezado y filas
  encabezados: string[];
  titulo?: ReactNode; // rótulo de sección dentro de la tarjeta
  minW?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <div className={minW}>
        {titulo && (
          <div className="px-6 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {titulo}
          </div>
        )}
        <div
          className={cn(
            "grid gap-2 border-b px-6 py-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground",
            titulo ? "bg-transparent" : "bg-muted/40",
            cols,
          )}
        >
          {encabezados.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

/* Clases de una fila estándar; `extra` para variantes (p. ej. resaltado). */
export function filaSimpleClases(cols: string, extra?: string) {
  return cn(
    "grid items-center gap-2 border-b px-6 py-3 text-sm last:border-b-0 hover:bg-accent/30",
    cols,
    extra,
  );
}

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* Tarjeta de número grande para paneles (Inventario, Métricas, Finanzas, Pedidos).
   `delta` es el % de cambio vs. el periodo anterior (null = sin comparativo). */
export function StatCard({
  etiqueta,
  valor,
  delta,
  deltaEtiqueta,
  icono: Icono,
  valorClassName,
}: {
  etiqueta: string;
  valor: string;
  delta?: number | null;
  deltaEtiqueta?: string; // p. ej. "vs. mes pasado"
  icono?: LucideIcon;
  valorClassName?: string;
}) {
  const tieneDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  return (
    <div className="rounded-2xl border bg-card px-4 py-3.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {Icono && <Icono className="size-3.5" strokeWidth={1.9} aria-hidden="true" />}
        {etiqueta}
      </div>
      <div className={cn("mt-2 text-[25px] font-bold tracking-tight tabular-nums", valorClassName)}>
        {valor}
      </div>
      {tieneDelta && (
        <div
          className={cn(
            "mt-0.5 text-xs font-semibold",
            delta! > 0 ? "text-green-600" : delta! < 0 ? "text-red-600" : "text-muted-foreground",
          )}
        >
          {delta! > 0 ? "▲" : delta! < 0 ? "▼" : "•"} {Math.abs(delta!).toFixed(0)}%
          {deltaEtiqueta && <span className="font-normal text-muted-foreground"> {deltaEtiqueta}</span>}
        </div>
      )}
    </div>
  );
}

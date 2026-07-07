"use client";

import { Button } from "@/components/ui/button";
import type { TaskConResponsable } from "@/lib/types";

/* Descarga un respaldo .json con las tareas actuales (red de seguridad de admin,
   equivalente al "Respaldar datos" de la Fase 1). */
export function ExportButton({ tareas }: { tareas: TaskConResponsable[] }) {
  function exportar() {
    const datos = {
      exportadoEl: new Date().toISOString(),
      total: tareas.length,
      tareas,
    };
    const blob = new Blob([JSON.stringify(datos, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const fecha = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `respaldo-fresafit-crm-${fecha}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={exportar} title="Descargar respaldo .json">
      💾 Respaldar
    </Button>
  );
}

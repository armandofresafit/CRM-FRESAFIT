"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { ESTADOS } from "@/lib/catalogos";
import { moverTarea } from "@/app/(app)/tareas/actions";
import type { TaskConResponsable, Profile, EstadoId } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Column } from "@/components/tareas/column";
import { TaskCard } from "@/components/tareas/task-card";
import { TaskDialog } from "@/components/tareas/task-dialog";
import { TaskFilters } from "@/components/tareas/task-filters";
import { ExportButton } from "@/components/tareas/export-button";

export function Board({
  tareas: inicial,
  equipo,
  currentUserId,
}: {
  tareas: TaskConResponsable[];
  equipo: Profile[];
  currentUserId: string;
}) {
  // Fuente de verdad = servidor (`inicial`). Los movimientos se aplican de forma
  // optimista y se revierten solos al revalidar tras la Server Action.
  const [tareas, aplicarMovimiento] = useOptimistic(
    inicial,
    (estado, m: { id: string; nuevoEstado: EstadoId }) =>
      estado.map((t) => (t.id === m.id ? { ...t, estado: m.nuevoEstado } : t)),
  );

  const [filtroResponsable, setFiltroResponsable] = useState("todos");
  const [filtroArea, setFiltroArea] = useState("todas");
  const [, startTransition] = useTransition();

  const [editando, setEditando] = useState<TaskConResponsable | null>(null);
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // Ratón: arrastre tras 6px. Táctil: retención de 200ms para no capturar el
    // scroll (un swipe rápido desplaza; mantener pulsado inicia el arrastre).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const filtradas = tareas.filter(
    (t) =>
      (filtroResponsable === "todos" ||
        t.responsable_id === filtroResponsable) &&
      (filtroArea === "todas" || t.area === filtroArea),
  );

  function mover(id: string, nuevoEstado: EstadoId) {
    const actual = tareas.find((t) => t.id === id);
    if (!actual || actual.estado === nuevoEstado) return;

    startTransition(async () => {
      aplicarMovimiento({ id, nuevoEstado });
      try {
        const r = await moverTarea(id, nuevoEstado);
        if ("error" in r) toast.error("No se pudo mover: " + r.error);
      } catch {
        toast.error("No se pudo mover la tarea. Revisa tu conexión.");
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const destino = String(over.id) as EstadoId;
    if (ESTADOS.some((es) => es.id === destino)) {
      mover(String(active.id), destino);
    }
  }

  function abrirNueva() {
    setEditando(null);
    setDialogAbierto(true);
  }
  function abrirEditar(t: TaskConResponsable) {
    setEditando(t);
    setDialogAbierto(true);
  }

  const activa = activeId ? tareas.find((t) => t.id === activeId) : null;

  return (
    <div>
      {/* Barra superior */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tareas del equipo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quién hace qué y en qué va cada cosa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TaskFilters
            equipo={equipo}
            filtroResponsable={filtroResponsable}
            setFiltroResponsable={setFiltroResponsable}
            filtroArea={filtroArea}
            setFiltroArea={setFiltroArea}
          />
          <ExportButton tareas={tareas} />
          <Button onClick={abrirNueva}>+ Nueva tarea</Button>
        </div>
      </div>

      {/* Tablero Kanban */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ESTADOS.map((estado) => (
            <Column
              key={estado.id}
              estadoId={estado.id}
              nombre={estado.nombre}
              tareas={filtradas.filter((t) => t.estado === estado.id)}
              onMover={mover}
              onEditar={abrirEditar}
            />
          ))}
        </div>

        <DragOverlay>
          {activa ? <TaskCard tarea={activa} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {dialogAbierto && (
        <TaskDialog
          key={editando?.id ?? "nueva"}
          tarea={editando}
          equipo={equipo}
          currentUserId={currentUserId}
          onClose={() => setDialogAbierto(false)}
        />
      )}
    </div>
  );
}

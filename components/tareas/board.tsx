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
import { AlertTriangle, Info, List, LayoutGrid, Calendar as CalendarIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { ESTADOS, AREAS, ROLES, esGestor } from "@/lib/catalogos";
import { esVencida } from "@/lib/fecha";
import { moverTarea, cambiarPrioridad } from "@/app/(app)/tareas/actions";
import type { TaskConResponsable, Profile, EstadoId, PrioridadId, RolId } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Column } from "@/components/tareas/column";
import { TaskCard } from "@/components/tareas/task-card";
import { TaskDialog } from "@/components/tareas/task-dialog";
import { TaskDetail } from "@/components/tareas/task-detail";
import { TaskFilters } from "@/components/tareas/task-filters";
import { CargaPersonas } from "@/components/tareas/carga-personas";
import { ExportButton } from "@/components/tareas/export-button";
import { VistaTabla } from "@/components/tareas/vista-tabla";
import { VistaCalendario } from "@/components/tareas/vista-calendario";

/* Alcance global: "mis" = solo lo asignado a mí; aplica en las TRES vistas. */
type Alcance = "mis" | "todas";
type VistaTop = "tabla" | "tablero" | "calendario";

const VISTAS_TOP = [
  ["tabla", "Tabla", List],
  ["tablero", "Tablero", LayoutGrid],
  ["calendario", "Calendario", CalendarIcon],
] as const;

export function Board({
  tareas: inicial,
  equipo,
  currentUserId,
  rol,
}: {
  tareas: TaskConResponsable[];
  equipo: Profile[];
  currentUserId: string;
  rol: RolId;
}) {
  const gestor = esGestor(rol);

  const [tareas, aplicarMovimiento] = useOptimistic(
    inicial,
    (estado, m: { id: string; nuevoEstado: EstadoId }) =>
      estado.map((t) => (t.id === m.id ? { ...t, estado: m.nuevoEstado } : t)),
  );

  const [vistaTop, setVistaTop] = useState<VistaTop>("tabla");
  const [alcance, setAlcance] = useState<Alcance>("todas");
  const [filtroResponsable, setFiltroResponsable] = useState("todos");
  const [filtroArea, setFiltroArea] = useState("todas");
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [, startTransition] = useTransition();

  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [detalle, setDetalle] = useState<TaskConResponsable | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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

  /* Cambio rápido de prioridad desde una celda (solo gestor; sin optimismo, se
     refresca al revalidar). */
  function cambiarPrio(id: string, prioridad: PrioridadId) {
    startTransition(async () => {
      try {
        const r = await cambiarPrioridad(id, prioridad);
        if ("error" in r) toast.error(r.error);
      } catch {
        toast.error("No se pudo cambiar la prioridad.");
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
    const raw = String(over.id);
    const estado = (raw.includes("::") ? raw.split("::")[1] : raw) as EstadoId;
    if (ESTADOS.some((es) => es.id === estado)) mover(String(active.id), estado);
  }

  const activa = activeId ? tareas.find((t) => t.id === activeId) : null;

  /* Conjunto base según el alcance: "mis" ignora los filtros de persona/área
     (es estrictamente lo asignado a mí); "todas" aplica ambos filtros. */
  const base =
    alcance === "mis"
      ? tareas.filter((t) => t.responsable_id === currentUserId)
      : tareas.filter(
          (t) =>
            (filtroResponsable === "todos" || t.responsable_id === filtroResponsable) &&
            (filtroArea === "todas" || t.area === filtroArea),
        );

  /* Contador de vencidas sobre lo mostrado (antes del filtro "solo vencidas"). */
  const vencidas = base.filter((t) => esVencida(t.fecha_limite, t.estado)).length;

  /* Filtro rápido "solo vencidas" (se alterna con clic en el contador).
     `filtradas` alimenta las TRES vistas: tabla, calendario y tablero. */
  const filtradas = soloVencidas
    ? base.filter((t) => esVencida(t.fecha_limite, t.estado))
    : base;
  const areasVisibles = AREAS.filter(
    (a) => (filtroArea === "todas" || a.id === filtroArea) && filtradas.some((t) => t.area === a.id),
  );

  const rolNombre = ROLES.find((r) => r.id === rol)?.nombre ?? "Miembro";

  return (
    <div>
      {/* Encabezado: título a la izquierda, acciones principales a la derecha */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">Tareas del equipo</h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            Quién hace qué y en qué va cada cosa — sin perseguir a nadie.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton tareas={filtradas} gestor={gestor} />
          {gestor && (
            <Button
              onClick={() => setNuevaAbierta(true)}
              className="h-auto gap-1.5 rounded-[11px] px-[17px] py-2.5 text-[13.5px] font-semibold shadow-[0_6px_16px_-8px_rgba(232,67,147,0.7)]"
            >
              <Plus className="size-4" strokeWidth={2.1} />
              Nueva tarea
            </Button>
          )}
        </div>
      </div>

      {/* Barra de herramientas: filtros/vistas a la izquierda, filtros de persona/área a la derecha */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Contador de vencidas — clic para ver SOLO las vencidas (alterna). */}
        {(vencidas > 0 || soloVencidas) && (
          <button
            type="button"
            onClick={() => setSoloVencidas((v) => !v)}
            aria-pressed={soloVencidas}
            title="Ver solo las tareas vencidas (clic para alternar)"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold transition-colors",
              soloVencidas ? "bg-red-600 text-white" : "bg-red-100 text-red-600 hover:bg-red-200",
            )}
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
            {vencidas} {vencidas === 1 ? "vencida" : "vencidas"}
          </button>
        )}

        {/* Alcance global: Mis tareas / Todas — aplica en las TRES vistas. */}
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(
            [
              ["mis", "Mis tareas"],
              ["todas", "Todas"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAlcance(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                alcance === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Selector de vista principal: Tabla / Tablero / Calendario */}
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {VISTAS_TOP.map(([id, label, Icono]) => (
            <button
              key={id}
              onClick={() => setVistaTop(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                vistaTop === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icono className="size-3.5" strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Filtros de PERSONA y ÁREA — solo con alcance "Todas" ("mis" ya es lo mío). */}
        {alcance === "todas" && (
          <>
            <Select value={filtroResponsable} onValueChange={(v) => setFiltroResponsable(v ?? "todos")}>
              <SelectTrigger className="w-[190px] bg-card">
                <SelectValue>
                  {(value: string) =>
                    value === "todos"
                      ? "Todas las personas"
                      : (equipo.find((p) => p.id === value)?.nombre ?? "Persona")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas las personas</SelectItem>
                {equipo.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <TaskFilters filtroArea={filtroArea} setFiltroArea={setFiltroArea} />
          </>
        )}
      </div>

      {/* Aviso de rol — es el rol REAL del usuario; la seguridad se aplica en la BD (RLS). */}
      <div className="mb-4 flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-[13px] text-muted-foreground">
        <Info className="size-[17px] shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <span>
          Tu acceso: <b className="font-semibold text-foreground">{rolNombre}</b> — tu rol real; los
          permisos se aplican en la base de datos (RLS), no solo en pantalla.{" "}
          {ROLES.find((r) => r.id === rol)?.desc}
        </span>
      </div>

      {/* Carga por persona (chips clicables = atajo de filtro "solo [persona]").
          Elegir a alguien cambia el alcance a "Todas" (el filtro vive ahí). */}
      <CargaPersonas
        tareas={tareas}
        equipo={equipo}
        seleccion={alcance === "todas" ? filtroResponsable : "todos"}
        onSeleccionar={(id) => {
          setAlcance("todas");
          setFiltroResponsable(id);
        }}
      />

      {/* ---- Vista TABLA ---- */}
      {vistaTop === "tabla" && (
        <VistaTabla
          tareas={filtradas}
          currentUserId={currentUserId}
          gestor={gestor}
          onAbrir={setDetalle}
          onMoverEstado={mover}
          onCambiarPrioridad={cambiarPrio}
        />
      )}

      {/* ---- Vista CALENDARIO ---- */}
      {vistaTop === "calendario" && <VistaCalendario tareas={filtradas} onAbrir={setDetalle} />}

      {/* ---- Vista TABLERO (kanban) ---- */}
      {vistaTop === "tablero" && (
      /* id fijo: evita el aviso de hidratación de dnd-kit (aria-describedby
          DndDescribedBy-0 vs -1) al hacer estable el id entre servidor y navegador. */
      <DndContext id="tablero-fresafit" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {alcance === "mis" ? (
          <>
            {filtradas.length === 0 && (
              <p className="mb-3 text-sm italic text-muted-foreground">
                No tienes tareas asignadas por ahora.
              </p>
            )}
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
              {ESTADOS.map((estado) => (
                <Column
                  key={estado.id}
                  estadoId={estado.id}
                  nombre={estado.nombre}
                  tareas={filtradas.filter((t) => t.estado === estado.id)}
                  onMover={mover}
                  onEditar={setDetalle}
                />
              ))}
            </div>
          </>
        ) : areasVisibles.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No hay tareas para mostrar con estos filtros.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Encabezado de columnas (una vez, arriba) */}
            <div className="hidden gap-4 xl:grid xl:grid-cols-4">
              {ESTADOS.map((e) => (
                <div key={e.id} className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {e.nombre}
                </div>
              ))}
            </div>

            {areasVisibles.map((area) => {
              const delArea = filtradas.filter((t) => t.area === area.id);
              return (
                <div key={area.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-block h-4 w-1.5 rounded" style={{ backgroundColor: area.color }} />
                    <span className="text-sm font-bold">{area.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {delArea.length} {delArea.length === 1 ? "tarea" : "tareas"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {ESTADOS.map((estado) => (
                      <Column
                        key={estado.id}
                        estadoId={estado.id}
                        droppableId={`${area.id}::${estado.id}`}
                        nombre={estado.nombre}
                        tareas={delArea.filter((t) => t.estado === estado.id)}
                        onMover={mover}
                        onEditar={setDetalle}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DragOverlay>{activa ? <TaskCard tarea={activa} overlay /> : null}</DragOverlay>
      </DndContext>
      )}

      {nuevaAbierta && (
        <TaskDialog
          equipo={equipo}
          currentUserId={currentUserId}
          onClose={() => setNuevaAbierta(false)}
        />
      )}

      {detalle && (
        <TaskDetail
          key={detalle.id}
          tarea={detalle}
          equipo={equipo}
          rol={rol}
          currentUserId={currentUserId}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

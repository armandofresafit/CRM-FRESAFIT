"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ESTADOS, PRIORIDADES, AREAS } from "@/lib/catalogos";
import {
  crearTarea,
  editarTarea,
  borrarTarea,
  type TaskInput,
} from "@/app/(app)/tareas/actions";
import type {
  TaskConResponsable,
  Profile,
  AreaId,
  EstadoId,
  PrioridadId,
} from "@/lib/types";

const SIN_ASIGNAR = "none";

export function TaskDialog({
  tarea,
  equipo,
  currentUserId,
  onClose,
}: {
  tarea: TaskConResponsable | null;
  equipo: Profile[];
  currentUserId: string;
  onClose: () => void;
}) {
  const esNueva = !tarea;
  const [pending, startTransition] = useTransition();

  // El componente se remonta (key) al abrir, así que basta inicializar de props.
  const [titulo, setTitulo] = useState(tarea?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? "");
  const [responsable, setResponsable] = useState(
    // Al EDITAR se respeta "Sin asignar" (null); el default a mí solo aplica al crear.
    tarea ? (tarea.responsable_id ?? SIN_ASIGNAR) : currentUserId || SIN_ASIGNAR,
  );
  const [area, setArea] = useState<AreaId>(tarea?.area ?? "general");
  const [prioridad, setPrioridad] = useState<PrioridadId>(
    tarea?.prioridad ?? "media",
  );
  const [estado, setEstado] = useState<EstadoId>(tarea?.estado ?? "por_hacer");
  const [fecha, setFecha] = useState(tarea?.fecha_limite ?? "");

  function guardar() {
    if (!titulo.trim()) {
      toast.error("La tarea necesita un título.");
      return;
    }
    const input: TaskInput = {
      titulo,
      descripcion,
      responsable_id: responsable === SIN_ASIGNAR ? null : responsable,
      area,
      prioridad,
      estado,
      fecha_limite: fecha || null,
    };
    startTransition(async () => {
      try {
        const r = esNueva
          ? await crearTarea(input)
          : await editarTarea(tarea!.id, input);
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
        toast.success(esNueva ? "Tarea creada." : "Cambios guardados.");
        onClose();
      } catch {
        toast.error("No se pudo guardar. Revisa tu conexión.");
      }
    });
  }

  function borrar() {
    if (!tarea) return;
    if (!confirm("¿Seguro que quieres borrar esta tarea? No se puede deshacer."))
      return;
    startTransition(async () => {
      try {
        const r = await borrarTarea(tarea.id);
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
        toast.success("Tarea borrada.");
        onClose();
      } catch {
        toast.error("No se pudo borrar. Revisa tu conexión.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{esNueva ? "Nueva tarea" : "Editar tarea"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              autoFocus
              placeholder="¿Qué hay que hacer?"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="descripcion">Descripción (opcional)</Label>
            <Textarea
              id="descripcion"
              rows={3}
              placeholder="Detalles, notas, links…"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Responsable</Label>
              <Select
                value={responsable}
                onValueChange={(v) => setResponsable(v ?? SIN_ASIGNAR)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
                  {equipo.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Área</Label>
              <Select
                value={area}
                onValueChange={(v) => v && setArea(v as AreaId)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Prioridad</Label>
              <Select
                value={prioridad}
                onValueChange={(v) => v && setPrioridad(v as PrioridadId)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Estado</Label>
              <Select
                value={estado}
                onValueChange={(v) => v && setEstado(v as EstadoId)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha">Fecha límite</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {!esNueva ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={borrar}
              disabled={pending}
            >
              Borrar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

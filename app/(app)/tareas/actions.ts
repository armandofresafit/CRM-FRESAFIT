"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AreaId, EstadoId, PrioridadId } from "@/lib/types";

export type TaskInput = {
  titulo: string;
  descripcion: string;
  responsable_id: string | null;
  area: AreaId;
  prioridad: PrioridadId;
  estado: EstadoId;
  fecha_limite: string | null;
};

type Resultado = { ok: true } | { error: string };

export async function crearTarea(input: TaskInput): Promise<Resultado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const titulo = input.titulo.trim();
  if (!titulo) return { error: "La tarea necesita un título." };

  const { error } = await supabase.from("tasks").insert({
    titulo,
    descripcion: input.descripcion.trim() || null,
    responsable_id: input.responsable_id,
    area: input.area,
    prioridad: input.prioridad,
    estado: input.estado,
    fecha_limite: input.fecha_limite || null,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/tareas");
  return { ok: true };
}

export async function editarTarea(
  id: string,
  input: TaskInput,
): Promise<Resultado> {
  const supabase = await createClient();

  const titulo = input.titulo.trim();
  if (!titulo) return { error: "La tarea necesita un título." };

  const { error } = await supabase
    .from("tasks")
    .update({
      titulo,
      descripcion: input.descripcion.trim() || null,
      responsable_id: input.responsable_id,
      area: input.area,
      prioridad: input.prioridad,
      estado: input.estado,
      fecha_limite: input.fecha_limite || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/tareas");
  return { ok: true };
}

export async function moverTarea(
  id: string,
  estado: EstadoId,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ estado })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/tareas");
  return { ok: true };
}

export async function borrarTarea(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/tareas");
  return { ok: true };
}

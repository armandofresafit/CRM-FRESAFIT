"use server";

import { revalidatePath } from "next/cache";
import { usuarioActual, esInterno } from "@/lib/supabase/usuario-actual";
import { esGestor } from "@/lib/catalogos";
import type { CanalId, Customer } from "@/lib/types";

type Resultado = { ok: true } | { error: string };

export type ClienteInput = {
  nombre: string;
  telefono: string;
  correo: string;
  canal: CanalId | null;
  notas: string;
};

const RUTAS = ["/clientes", "/metricas"];
const revalidar = () => RUTAS.forEach((r) => revalidatePath(r));

export async function guardarCliente(id: string | null, input: ClienteInput): Promise<Resultado> {
  const { supabase, user, rol } = await usuarioActual();
  if (!user) return { error: "No autenticado." };
  if (!esInterno(rol)) return { error: "Solo el equipo interno puede gestionar clientes." };

  const nombre = input.nombre.trim();
  if (!nombre) return { error: "El cliente necesita un nombre." };

  const fila = {
    nombre,
    telefono: input.telefono.trim() || null,
    correo: input.correo.trim() || null,
    canal: input.canal,
    notas: input.notas.trim() || null,
  };

  const { error } = id
    ? await supabase.from("customers").update(fila).eq("id", id)
    : await supabase.from("customers").insert({ ...fila, created_by: user.id });

  if (error) return { error: error.message };
  revalidar();
  return { ok: true };
}

export async function borrarCliente(id: string): Promise<Resultado> {
  const { supabase, user, rol } = await usuarioActual();
  if (!user) return { error: "No autenticado." };
  if (!esGestor(rol)) return { error: "Solo dirección o coordinación puede borrar clientes." };

  /* Las ventas NO se borran: se quedan sin cliente (la FK es ON DELETE SET NULL). */
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidar();
  return { ok: true };
}

/* Alta rápida desde el diálogo de venta: solo el nombre. Devuelve el cliente
   para poder seleccionarlo sin recargar. */
export async function crearClienteRapido(
  nombre: string,
  canal: CanalId | null,
): Promise<{ ok: true; cliente: Customer } | { error: string }> {
  const { supabase, user, rol } = await usuarioActual();
  if (!user) return { error: "No autenticado." };
  if (!esInterno(rol)) return { error: "Solo el equipo interno puede crear clientes." };

  const limpio = nombre.trim();
  if (!limpio) return { error: "El cliente necesita un nombre." };

  const { data, error } = await supabase
    .from("customers")
    .insert({ nombre: limpio, canal, created_by: user.id })
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo crear el cliente." };

  revalidar();
  return { ok: true, cliente: data as Customer };
}

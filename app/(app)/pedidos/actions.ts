"use server";

import { revalidatePath } from "next/cache";
import { usuarioActual, esInterno } from "@/lib/supabase/usuario-actual";
import type { EstadoPedidoId } from "@/lib/types";

type Resultado = { ok: true } | { error: string };

const RUTAS = ["/pedidos", "/metricas", "/clientes"];
const revalidar = () => RUTAS.forEach((r) => revalidatePath(r));

/* Cambio de estado del pedido en línea (nuevo → preparando → enviado → …). */
export async function cambiarEstadoPedido(id: string, estado: EstadoPedidoId): Promise<Resultado> {
  const { supabase, user, rol } = await usuarioActual();
  if (!user) return { error: "No autenticado." };
  if (!esInterno(rol)) return { error: "Solo el equipo interno puede mover pedidos." };

  const { error } = await supabase.from("sales").update({ estado }).eq("id", id);
  if (error) return { error: error.message };
  revalidar();
  return { ok: true };
}

/* Guardar paquetería y número de guía (y opcionalmente marcar enviado). */
export async function guardarEnvio(
  id: string,
  paqueteria: string,
  numGuia: string,
): Promise<Resultado> {
  const { supabase, user, rol } = await usuarioActual();
  if (!user) return { error: "No autenticado." };
  if (!esInterno(rol)) return { error: "Solo el equipo interno puede editar envíos." };

  const { error } = await supabase
    .from("sales")
    .update({
      paqueteria: paqueteria.trim() || null,
      num_guia: numGuia.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidar();
  return { ok: true };
}

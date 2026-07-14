"use server";

import { revalidatePath } from "next/cache";
import { usuarioActual } from "@/lib/supabase/usuario-actual";
import type { CategoriaGastoId, ExpenseReceipt } from "@/lib/types";

type Resultado = { ok: true } | { error: string };

export type GastoInput = {
  fecha: string;
  concepto: string;
  monto: number;
  categoria: CategoriaGastoId;
  proveedor: string;
  notas: string;
};

const NO_AUTORIZADO = "Solo Dirección puede ver y mover las finanzas.";

/* Todo el módulo es de dirección: un solo portero para no repetirlo.
   La BD lo refuerza con RLS (policies es_admin) — esto es defensa en profundidad. */
async function direccion() {
  const { supabase, user, rol } = await usuarioActual();
  if (!user || rol !== "direccion") return null;
  return { supabase, user };
}

/* ============================ Gastos ====================================== */

export async function guardarGasto(id: string | null, input: GastoInput): Promise<Resultado> {
  const cx = await direccion();
  if (!cx) return { error: NO_AUTORIZADO };

  const concepto = input.concepto.trim();
  if (!concepto) return { error: "El gasto necesita un concepto (qué se pagó)." };
  if (!input.fecha) return { error: "Falta la fecha del gasto." };
  if (!Number.isFinite(input.monto) || input.monto < 0) return { error: "El monto no puede ser negativo." };

  const fila = {
    fecha: input.fecha,
    concepto,
    monto: input.monto,
    categoria: input.categoria,
    proveedor: input.proveedor.trim() || null,
    notas: input.notas.trim() || null,
  };

  const { error } = id
    ? await cx.supabase.from("expenses").update(fila).eq("id", id)
    : await cx.supabase.from("expenses").insert({ ...fila, created_by: cx.user.id });

  if (error) return { error: error.message };
  revalidatePath("/finanzas");
  return { ok: true };
}

export async function borrarGasto(id: string): Promise<Resultado> {
  const cx = await direccion();
  if (!cx) return { error: NO_AUTORIZADO };

  /* Los comprobantes se van en cascada en la BD; hay que limpiar los binarios. */
  const { data: comprobantes } = await cx.supabase
    .from("expense_receipts")
    .select("storage_path")
    .eq("expense_id", id);
  const rutas = (comprobantes ?? []).map((c) => c.storage_path as string);
  if (rutas.length > 0) await cx.supabase.storage.from("facturas").remove(rutas);

  const { error } = await cx.supabase.from("expenses").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/finanzas");
  return { ok: true };
}

/* ============================ Comprobantes (Storage) ====================== */

/* Devuelve el comprobante creado para que el diálogo abierto lo pinte al
   instante (sus props son una foto del gasto anterior a la subida). */
export async function subirComprobante(
  expenseId: string,
  formData: FormData,
): Promise<{ ok: true; comprobante: ExpenseReceipt } | { error: string }> {
  const cx = await direccion();
  if (!cx) return { error: NO_AUTORIZADO };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No se recibió el archivo." };
  if (file.size > 10 * 1024 * 1024) return { error: "El archivo supera 10 MB." };

  const limpio = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${expenseId}/${Date.now()}-${limpio}`;

  const { error: upErr } = await cx.supabase.storage.from("facturas").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upErr) return { error: upErr.message };

  const { data, error } = await cx.supabase
    .from("expense_receipts")
    .insert({
      expense_id: expenseId,
      nombre: file.name,
      storage_path: path,
      tipo: file.type || null,
    })
    .select("*")
    .single();
  if (error || !data) {
    // El binario ya subió pero no se registró: no dejar basura en Storage.
    await cx.supabase.storage.from("facturas").remove([path]);
    return { error: error?.message ?? "No se pudo registrar el comprobante." };
  }
  revalidatePath("/finanzas");
  return { ok: true, comprobante: data as ExpenseReceipt };
}

export async function borrarComprobante(id: string, storagePath: string): Promise<Resultado> {
  const cx = await direccion();
  if (!cx) return { error: NO_AUTORIZADO };

  await cx.supabase.storage.from("facturas").remove([storagePath]);
  const { error } = await cx.supabase.from("expense_receipts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/finanzas");
  return { ok: true };
}

/* URL firmada temporal (1 h) para ver o descargar un comprobante. */
export async function urlComprobante(
  storagePath: string,
): Promise<{ url: string } | { error: string }> {
  const cx = await direccion();
  if (!cx) return { error: NO_AUTORIZADO };

  const { data, error } = await cx.supabase.storage
    .from("facturas")
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data) return { error: error?.message ?? "No se pudo generar el enlace." };
  return { url: data.signedUrl };
}

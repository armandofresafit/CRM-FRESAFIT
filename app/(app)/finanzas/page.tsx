import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { diasDesdeHoy } from "@/lib/fecha";
import { PanelFinanzas } from "@/components/finanzas/panel";
import type { ExpenseConComprobantes, RolId, Sale } from "@/lib/types";

export const metadata = { title: "Finanzas · Fresafit" };

/* Ventana de datos: cubre "mes pasado" y su comparativo (el antepasado). */
const DIAS_VENTANA = 120;

export default async function FinanzasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* Guarda de rol: solo Dirección. La BD ya lo impide con RLS (no vería una
     sola fila), pero se corta aquí para no mostrar un panel vacío y confuso. */
  const { data: perfil } = user
    ? await supabase.from("profiles").select("rol").eq("id", user.id).single()
    : { data: null };
  const rol = ((perfil as { rol?: RolId } | null)?.rol ?? "miembro") as RolId;
  if (rol !== "direccion") redirect("/tareas");

  const desde = diasDesdeHoy(-DIAS_VENTANA);

  const [gastosRes, ventasRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, comprobantes:expense_receipts(*)")
      .gte("fecha", desde)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    /* Entradas = ventas (Fase 2). No hay tabla de ingresos: se derivan. */
    supabase.from("sales").select("fecha, monto").gte("fecha", desde).limit(5000),
  ]);

  const gastos = (gastosRes.data ?? []) as unknown as ExpenseConComprobantes[];
  const ventas = (ventasRes.data ?? []) as Pick<Sale, "fecha" | "monto">[];

  return <PanelFinanzas gastos={gastos} ventas={ventas} />;
}

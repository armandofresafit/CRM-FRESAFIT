import { createClient } from "@/lib/supabase/server";
import { diasDesdeHoy } from "@/lib/fecha";
import { PanelPedidos } from "@/components/pedidos/panel";
import type { RolId, SaleConDetalle } from "@/lib/types";

export const metadata = { title: "Pedidos · Fresafit" };

/* Ventana amplia: un pedido pendiente puede ser de hace semanas. */
const DIAS_VENTANA = 120;

export default async function PedidosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [pedidosRes, perfilRes] = await Promise.all([
    /* Solo filas con estado = las que son "pedido" (las ventas históricas sin
       flujo de envío quedan fuera). */
    supabase
      .from("sales")
      .select(
        "*, producto:products!producto_id(id, nombre, variante), cliente:customers!cliente_id(id, nombre)",
      )
      .not("estado", "is", null)
      .gte("fecha", diasDesdeHoy(-DIAS_VENTANA))
      .order("fecha", { ascending: false })
      .limit(5000),
    user
      ? supabase.from("profiles").select("rol").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const pedidos = (pedidosRes.data ?? []) as unknown as SaleConDetalle[];
  const rol = ((perfilRes.data as { rol?: RolId } | null)?.rol ?? "miembro") as RolId;

  return <PanelPedidos pedidos={pedidos} rol={rol} />;
}

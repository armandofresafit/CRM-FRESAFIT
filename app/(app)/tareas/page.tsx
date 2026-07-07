import { createClient } from "@/lib/supabase/server";
import { Board } from "@/components/tareas/board";
import type { TaskConResponsable, Profile } from "@/lib/types";

export const metadata = { title: "Tareas · Fresafit" };

export default async function TareasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [tareasRes, equipoRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*, responsable:profiles!responsable_id(id, nombre, color)",
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, nombre, rol, area, color")
      .order("nombre"),
  ]);

  const tareas = (tareasRes.data ?? []) as unknown as TaskConResponsable[];
  const equipo = (equipoRes.data ?? []) as Profile[];

  return (
    <Board tareas={tareas} equipo={equipo} currentUserId={user?.id ?? ""} />
  );
}

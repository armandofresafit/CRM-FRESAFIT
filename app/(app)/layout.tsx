import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import type { Profile } from "@/lib/types";

/* Shell de la app protegida: sidebar + área principal.
   Doble guardia (además del middleware): sin sesión → login. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { count: tareasActivas }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nombre, rol, area, color")
      .eq("id", user.id)
      .single(),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .neq("estado", "hecho"),
  ]);

  return (
    <div className="flex min-h-screen max-md:flex-col">
      <Sidebar
        profile={profile as Profile | null}
        email={user.email ?? ""}
        tareasActivas={tareasActivas ?? 0}
      />
      <main className="flex-1 overflow-x-auto bg-[#f4f4f6] p-6 md:p-7">{children}</main>
    </div>
  );
}

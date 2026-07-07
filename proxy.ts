import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/* Next 16: el antiguo `middleware.ts` ahora es `proxy.ts` (misma API). */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /* Todas las rutas salvo estáticos, imágenes y el favicon. */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

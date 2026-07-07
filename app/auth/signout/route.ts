import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Cierra la sesión y vuelve al login. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}

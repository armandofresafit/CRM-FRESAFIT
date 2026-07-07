/* ============================================================================
   scripts/import-legacy.mjs  —  Importar tareas de la Fase 1 a Supabase
   ----------------------------------------------------------------------------
   Toma un respaldo .json descargado desde la app antigua (botón "Respaldar
   datos", formato { schemaVersion, tareas: [...] }) y lo inserta en la tabla
   `tasks`, mapeando el "responsable" (slug) al usuario correspondiente.

   Uso (Node 20+):
     node --env-file=.env.local scripts/import-legacy.mjs ruta/al/respaldo.json

   Requiere: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
   Nota: corre el seed (scripts/seed.mjs) antes, para que existan los usuarios.
   ============================================================================ */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ruta = process.argv[2];

if (!URL || !SERVICE_KEY || URL.includes("placeholder")) {
  console.error("Faltan credenciales reales en .env.local.");
  process.exit(1);
}
if (!ruta) {
  console.error("Uso: node --env-file=.env.local scripts/import-legacy.mjs <respaldo.json>");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* Mapa slug -> uuid, a partir de los emails <slug>@fresafit.com. */
async function mapaEquipo() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const mapa = {};
  for (const u of data.users) {
    const m = /^([^@]+)@fresafit\.com$/i.exec(u.email ?? "");
    if (m) mapa[m[1].toLowerCase()] = u.id;
  }
  return mapa;
}

async function main() {
  const raw = JSON.parse(readFileSync(ruta, "utf8"));
  const tareas = Array.isArray(raw?.tareas) ? raw.tareas : [];
  if (tareas.length === 0) {
    console.log("El respaldo no tiene tareas.");
    return;
  }

  // Guarda anti-duplicado: no importar si ya hay tareas (evita duplicar en un
  // segundo run accidental; para reimportar, vacía la tabla primero).
  const { count } = await admin.from("tasks").select("id", { count: "exact", head: false });
  if (count && count > 0) {
    console.log(`La tabla tasks ya tiene ${count} tareas; se aborta para no duplicar.`);
    return;
  }

  const equipo = await mapaEquipo();
  const fallback = equipo["armando"] ?? null;

  // Avisar de responsables que no se pudieron mapear (quedarán "Sin asignar").
  const noMapeados = [...new Set(tareas.map((t) => t.responsable).filter((r) => r && !equipo[r]))];
  if (noMapeados.length) {
    console.warn(`⚠️  responsables no reconocidos → "Sin asignar": ${noMapeados.join(", ")}`);
  }

  const filas = tareas.map((t) => ({
    titulo: t.titulo,
    descripcion: t.descripcion || null,
    responsable_id: equipo[t.responsable] ?? null,
    area: t.area || "general",
    prioridad: t.prioridad || "media",
    estado: t.estado || "por_hacer",
    fecha_limite: t.fechaLimite || null,
    created_by: fallback,
  }));

  const { error } = await admin.from("tasks").insert(filas);
  if (error) throw error;
  console.log(`＋ ${filas.length} tareas importadas desde ${ruta}.`);
}

main().catch((e) => {
  console.error("Error importando:", e.message ?? e);
  process.exit(1);
});

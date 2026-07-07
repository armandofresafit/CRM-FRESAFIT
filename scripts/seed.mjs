/* ============================================================================
   scripts/seed.mjs  —  Siembra inicial de Fresafit CRM
   ----------------------------------------------------------------------------
   Crea los 4 usuarios del equipo en Supabase Auth, ajusta sus perfiles
   (rol/área/color) e inserta las 5 tareas de ejemplo (las mismas de la Fase 1).
   Es idempotente: se puede correr varias veces sin duplicar.

   Uso (Node 20+):
     node --env-file=.env.local scripts/seed.mjs

   Requiere en el entorno:
     NEXT_PUBLIC_SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   (service role — NUNCA en el cliente ni en git)

   Contraseña inicial para los 4: variable SEED_PASSWORD o "Fresafit2026!".
   Cámbienla desde Supabase tras el primer login.
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.SEED_PASSWORD || "Fresafit2026!";

if (!URL || !SERVICE_KEY || URL.includes("placeholder")) {
  console.error(
    "Faltan credenciales reales. Configura NEXT_PUBLIC_SUPABASE_URL y " +
      "SUPABASE_SERVICE_ROLE_KEY en .env.local antes de sembrar.",
  );
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EQUIPO = [
  { slug: "armando",  nombre: "Armando",  rol: "admin",   area: "general",     color: "#e84393" },
  { slug: "rene",     nombre: "René",     rol: "miembro", area: "operaciones", color: "#0984e3" },
  { slug: "emiliano", nombre: "Emiliano", rol: "miembro", area: "marketing",   color: "#00b894" },
  { slug: "aaron",    nombre: "Aaron",    rol: "miembro", area: "marketing",   color: "#fdcb6e" },
];

/* Fechas relativas a hoy, formato AAAA-MM-DD. */
function enDias(d) {
  const f = new Date();
  f.setDate(f.getDate() + d);
  return f.toISOString().slice(0, 10);
}

const TAREAS_EJEMPLO = [
  { titulo: "Reponer stock de guantes talla M", descripcion: "Revisar inventario y hacer pedido al proveedor.", responsable: "rene", estado: "por_hacer", prioridad: "alta", area: "inventario", fecha_limite: enDias(3) },
  { titulo: "Campaña de Instagram para lanzamiento", descripcion: "Preparar 5 posts y 3 reels.", responsable: "aaron", estado: "en_progreso", prioridad: "media", area: "marketing", fecha_limite: enDias(5) },
  { titulo: "Contactar clientes mayoristas", descripcion: "Seguimiento a los 10 prospectos de la feria.", responsable: "emiliano", estado: "en_progreso", prioridad: "alta", area: "ventas", fecha_limite: enDias(2) },
  { titulo: "Revisar diseño del CRM interno", descripcion: "Validar la Fase 1 del sistema de tareas.", responsable: "armando", estado: "en_revision", prioridad: "media", area: "general", fecha_limite: enDias(7) },
  { titulo: "Definir metas de ventas del mes", descripcion: "", responsable: "armando", estado: "hecho", prioridad: "media", area: "finanzas", fecha_limite: enDias(-1) },
];

/* Devuelve el uid del usuario, creándolo si no existe. */
async function asegurarUsuario(persona) {
  const email = `${persona.slug}@fresafit.com`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nombre: persona.nombre },
  });

  if (data?.user) return { id: data.user.id, creado: true };

  // Ya existía: buscarlo en la lista de usuarios.
  if (error && /already been registered|already exists/i.test(error.message)) {
    const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = lista.users.find((x) => x.email === email);
    if (u) return { id: u.id, creado: false };
  }
  throw error ?? new Error(`No se pudo crear/encontrar ${email}`);
}

async function main() {
  const idPorSlug = {};

  for (const persona of EQUIPO) {
    const { id, creado } = await asegurarUsuario(persona);
    idPorSlug[persona.slug] = id;

    // El trigger ya creó un profile básico; aquí fijamos rol/área/color/nombre.
    const { error } = await admin.from("profiles").upsert({
      id,
      nombre: persona.nombre,
      rol: persona.rol,
      area: persona.area,
      color: persona.color,
    });
    if (error) throw error;
    console.log(`${creado ? "＋ creado " : "· existente"}  ${persona.nombre.padEnd(9)} ${persona.slug}@fresafit.com`);
  }

  // Insertar tareas de ejemplo solo si la tabla está vacía (no duplicar).
  const { count } = await admin.from("tasks").select("*", { count: "exact", head: true });
  if (count && count > 0) {
    console.log(`\nLa tabla tasks ya tiene ${count} tareas; no se siembran ejemplos.`);
    return;
  }

  const filas = TAREAS_EJEMPLO.map((t) => ({
    titulo: t.titulo,
    descripcion: t.descripcion || null,
    responsable_id: idPorSlug[t.responsable],
    area: t.area,
    prioridad: t.prioridad,
    estado: t.estado,
    fecha_limite: t.fecha_limite,
    created_by: idPorSlug["armando"],
  }));

  const { error } = await admin.from("tasks").insert(filas);
  if (error) throw error;
  console.log(`\n＋ ${filas.length} tareas de ejemplo insertadas.`);
  console.log(`\nContraseña inicial de todos: ${PASSWORD}  (cámbienla tras el primer login)`);
}

main().catch((e) => {
  console.error("\nError sembrando:", e.message ?? e);
  process.exit(1);
});

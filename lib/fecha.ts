/* Helpers de fecha portados de la Fase 1 (js/modules/tasks.js). */

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/* Convierte "2026-07-10" en algo legible como "10 jul". */
export function formatearFecha(iso: string): string {
  const [, mm, dd] = iso.split("-");
  return `${parseInt(dd, 10)} ${MESES[parseInt(mm, 10) - 1]}`;
}

/* Hoy en formato AAAA-MM-DD, en la zona horaria LOCAL del usuario.
   (Usar toISOString() daría la fecha UTC y marcaría tareas como vencidas
   horas antes en husos negativos como México, UTC-6.) */
export function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ¿La tarea está vencida? (fecha límite pasada y no está "hecho"). */
export function esVencida(fechaLimite: string | null, estado: string): boolean {
  if (!fechaLimite) return false;
  return fechaLimite < hoyISO() && estado !== "hecho";
}

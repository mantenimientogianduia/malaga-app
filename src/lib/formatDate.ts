export function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [, month, day] = fecha.slice(0, 10).split("-");
  if (!month || !day) return fecha;
  return `${day}/${month}`;
}

export function formatFechaHora(ts: string | null | undefined): string {
  if (!ts) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

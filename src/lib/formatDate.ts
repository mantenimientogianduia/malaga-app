export function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [, month, day] = fecha.slice(0, 10).split("-");
  if (!month || !day) return fecha;
  return `${day}/${month}`;
}

const FORMATO_MALAGA = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatFechaHora(ts: string | null | undefined): string {
  if (!ts) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  const partes = Object.fromEntries(FORMATO_MALAGA.formatToParts(date).map((p) => [p.type, p.value]));
  const dos = (v: string) => v.padStart(2, "0");
  return `${dos(partes.day)}/${dos(partes.month)} ${dos(partes.hour)}:${dos(partes.minute)}`;
}

const FORMATO_HORA_MALAGA = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatHora(ts: string | null | undefined): string {
  if (!ts) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return FORMATO_HORA_MALAGA.format(date);
}

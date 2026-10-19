const FORMATO_MALAGA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "en-CA" formatea como YYYY-MM-DD.
export function fechaEnMalaga(ahora: Date = new Date()): string {
  return FORMATO_MALAGA.format(ahora);
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function mananaEnMalaga(ahora: Date = new Date()): string {
  return sumarDias(fechaEnMalaga(ahora), 1);
}

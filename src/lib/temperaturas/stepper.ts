export const TEMPERATURA_INICIAL = -12;
export const PASO_TEMPERATURA = 0.5;

// Suma `delta` y deja un solo decimal: evita que -12 + 0,5 + 0,5 ... arrastre error de punto flotante.
export function ajustarTemperatura(actual: number, delta: number): number {
  return Math.round((actual + delta) * 10) / 10;
}

// Interpreta el texto del campo (acepta coma o punto). Devuelve null si no es un número.
export function parsearTemperatura(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

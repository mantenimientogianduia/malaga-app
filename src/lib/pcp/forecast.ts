export interface RegresionLineal {
  pendiente: number;
  ordenada: number;
}

// Regresión lineal simple por mínimos cuadrados, con x = 0, 1, 2, ... (una semana por punto).
export function regresionLineal(valores: number[]): RegresionLineal {
  const n = valores.length;
  if (n === 0) return { pendiente: 0, ordenada: 0 };
  if (n === 1) return { pendiente: 0, ordenada: valores[0] };

  const xs = valores.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = valores.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * valores[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);

  const denominador = n * sumXX - sumX * sumX;
  if (denominador === 0) return { pendiente: 0, ordenada: sumY / n };

  const pendiente = (n * sumXY - sumX * sumY) / denominador;
  const ordenada = (sumY - pendiente * sumX) / n;
  return { pendiente, ordenada };
}

// Proyecta el valor del siguiente punto (x = n) sobre la recta ajustada a `valores`.
export function proyectarSiguiente(valores: number[]): number {
  if (valores.length === 0) return 0;
  const { pendiente, ordenada } = regresionLineal(valores);
  return pendiente * valores.length + ordenada;
}

// Día ISO de la semana (1 = lunes ... 7 = domingo) para una fecha dada.
export function diaSemanaIso(fecha: Date): number {
  const diaJs = fecha.getUTCDay(); // 0 = domingo ... 6 = sábado
  return diaJs === 0 ? 7 : diaJs;
}

// Redondea `valor` hacia arriba al múltiplo de `loteOptimo` más cercano.
// loteOptimo nulo o 0 significa "libre": no hay restricción de redondeo.
export function redondearArriba(valor: number, loteOptimo: number | null): number {
  if (!loteOptimo) return valor;
  return Math.ceil(valor / loteOptimo) * loteOptimo;
}

export interface NecesarioInput {
  demanda: number;
  stockActual: number;
  stockMinimo: number;
  coccionesPendientes: number;
}

export function calcularNecesario(input: NecesarioInput): number {
  return input.demanda - input.stockActual + input.stockMinimo - input.coccionesPendientes;
}

export interface CantidadAPlanificarInput {
  necesario: number;
  loteOptimo: number | null;
  loteMinimo: number | null;
}

export function calcularCantidadAPlanificar(input: CantidadAPlanificarInput): number {
  if (input.necesario <= 0) return 0;
  const redondeado = redondearArriba(input.necesario, input.loteOptimo);
  return input.loteMinimo ? Math.max(redondeado, input.loteMinimo) : redondeado;
}

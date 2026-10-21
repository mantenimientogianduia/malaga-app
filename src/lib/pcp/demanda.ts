export const DEMANDA_SEMANAL_INICIAL = 550;
// Porcentaje de la semana que cae en cada día, de lunes (índice 0) a domingo (índice 6).
export const PCT_DIA_INICIAL = [13, 13, 13, 13, 16, 16, 16];

const MAX_DIAS_COBERTURA = 60;

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

// kg de un sabor en un día: demanda semanal × % del sabor × % del día.
export function demandaDiaSabor(demandaSemanalKg: number, pctSabor: number, pctDia: number): number {
  return redondear3((demandaSemanalKg * pctSabor * pctDia) / 10000);
}

// Día ISO de la semana (1 = lunes ... 7 = domingo) de una fecha 'YYYY-MM-DD'.
export function diaSemanaDeFecha(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const diaJs = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return diaJs === 0 ? 7 : diaJs;
}

// Peso de cada día de la ventana de cobertura: 3 -> [1, 1, 1]; 2,5 -> [1, 1, 0,5]; 0 -> [].
export function pesosCobertura(diasCobertura: number): number[] {
  const pesos: number[] = [];
  let restante = diasCobertura;
  while (restante > 1e-9 && pesos.length < MAX_DIAS_COBERTURA) {
    pesos.push(Math.min(1, redondear3(restante)));
    restante = redondear3(restante - 1);
  }
  return pesos;
}

export function sumaPct(pcts: number[]): number {
  return redondear2(pcts.reduce((acc, p) => acc + p, 0));
}

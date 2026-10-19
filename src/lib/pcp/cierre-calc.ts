import { calcularCantidadAPlanificar } from "./forecast";

export interface ItemBase {
  idSubprod: number;
  // Cantidad de base que lleva UNA bacha estándar del sabor.
  cantSubprod: number;
}

export interface SaborCierre {
  idProd: number;
  detalle: string;
  pesoEstandar: number | null;
  demandaBaseKgDia: number;
  // kg de OPs de fabricación de este sabor ya pendientes (planificada / en_proceso).
  coccionesPendientes: number;
  items: ItemBase[];
}

export interface StockSabor {
  kgObrador: number;
  kgExhibidaPonderada: number;
}

export interface BaseCierre {
  idProd: number;
  detalle: string;
  stockReal: number;
  coccionesPendientes: number;
  loteOptimo: number | null;
  loteMinimo: number | null;
}

export interface FilaFabricacion {
  idProd: number;
  detalle: string;
  pesoEstandar: number | null;
  sinPeso: boolean;
  demandaManana: number;
  stockDisponible: number;
  coccionesPendientes: number;
  necesario: number;
  bachas: number;
  kgAFabricar: number;
}

export interface FilaBase {
  idProd: number;
  detalle: string;
  stockReal: number;
  necesidadFabricacion: number;
  descongelar: number;
  faltante: number;
  consumoDiario: number;
  stockTrasManana: number;
  objetivo: number;
  coccionesPendientes: number;
  aReponer: number;
  kgACocinar: number;
}

const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

export function calcularFabricacion(
  sabor: SaborCierre,
  stock: StockSabor,
  margenPct: number
): FilaFabricacion {
  const demandaManana = redondear3(sabor.demandaBaseKgDia * (1 + margenPct / 100));
  const stockDisponible = redondear3(stock.kgObrador + stock.kgExhibidaPonderada);
  const necesario = redondear3(demandaManana - stockDisponible - sabor.coccionesPendientes);
  const peso = sabor.pesoEstandar;
  const sinPeso = !peso || peso <= 0;
  // El redondeo previo evita que 3.0000000000000004 cuente como 4 bachas.
  const bachas = sinPeso || necesario <= 0 ? 0 : Math.ceil(redondear3(necesario / (peso as number)));
  const kgAFabricar = sinPeso ? 0 : redondear3(bachas * (peso as number));
  return {
    idProd: sabor.idProd,
    detalle: sabor.detalle,
    pesoEstandar: sabor.pesoEstandar,
    sinPeso,
    demandaManana,
    stockDisponible,
    coccionesPendientes: sabor.coccionesPendientes,
    necesario,
    bachas,
    kgAFabricar,
  };
}

export function calcularBases(args: {
  sabores: SaborCierre[];
  // idProd del sabor -> bachas que se fabrican mañana (nuevas + ya pendientes).
  bachasMananaPorSabor: Map<number, number>;
  bases: BaseCierre[];
  margenPct: number;
  diasCobertura: number;
}): FilaBase[] {
  return args.bases.map((base) => {
    let necesidad = 0;
    let consumo = 0;
    for (const sabor of args.sabores) {
      const cantPorBacha = sabor.items
        .filter((i) => i.idSubprod === base.idProd)
        .reduce((acc, i) => acc + i.cantSubprod, 0);
      if (cantPorBacha === 0) continue;
      necesidad += cantPorBacha * (args.bachasMananaPorSabor.get(sabor.idProd) ?? 0);
      if (sabor.pesoEstandar && sabor.pesoEstandar > 0) {
        consumo += (cantPorBacha * sabor.demandaBaseKgDia * (1 + args.margenPct / 100)) / sabor.pesoEstandar;
      }
    }
    const necesidadFabricacion = redondear3(necesidad);
    const consumoDiario = redondear3(consumo);
    const descongelar = redondear3(Math.min(necesidadFabricacion, base.stockReal));
    const faltante = redondear3(Math.max(necesidadFabricacion - base.stockReal, 0));
    const stockTrasManana = redondear3(base.stockReal - descongelar);
    const objetivo = redondear3(consumoDiario * args.diasCobertura);
    const aReponer = redondear3(objetivo + faltante - stockTrasManana - base.coccionesPendientes);
    const kgACocinar = calcularCantidadAPlanificar({
      necesario: aReponer,
      loteOptimo: base.loteOptimo,
      loteMinimo: base.loteMinimo,
    });
    return {
      idProd: base.idProd,
      detalle: base.detalle,
      stockReal: base.stockReal,
      necesidadFabricacion,
      descongelar,
      faltante,
      consumoDiario,
      stockTrasManana,
      objetivo,
      coccionesPendientes: base.coccionesPendientes,
      aReponer,
      kgACocinar,
    };
  });
}

export interface EntradasCierre {
  margenPct: number;
  diasCobertura: number;
  sabores: SaborCierre[];
  stockSabores: Record<number, StockSabor>;
  bases: BaseCierre[];
  // idProd del sabor -> bachas editadas a mano.
  bachasOverride?: Record<number, number>;
  // idProd de la base -> kg a cocinar editados a mano.
  cocinarOverride?: Record<number, number>;
}

export interface ResultadoCierre {
  fabricacion: FilaFabricacion[];
  bases: FilaBase[];
}

export function calcularCierre(e: EntradasCierre): ResultadoCierre {
  const fabricacion = e.sabores.map((s) => {
    const calculada = calcularFabricacion(
      s,
      e.stockSabores[s.idProd] ?? { kgObrador: 0, kgExhibidaPonderada: 0 },
      e.margenPct
    );
    const bachasEditadas = e.bachasOverride?.[s.idProd];
    // Un override inválido (negativo, no entero, NaN) se trata como "sin override".
    if (
      bachasEditadas === undefined ||
      !Number.isInteger(bachasEditadas) ||
      bachasEditadas < 0 ||
      calculada.sinPeso
    ) {
      return calculada;
    }
    return {
      ...calculada,
      bachas: bachasEditadas,
      kgAFabricar: redondear3(bachasEditadas * (s.pesoEstandar as number)),
    };
  });

  const bachasMananaPorSabor = new Map(
    fabricacion.map((f) => [
      f.idProd,
      f.bachas + (f.pesoEstandar && f.pesoEstandar > 0 ? f.coccionesPendientes / f.pesoEstandar : 0),
    ])
  );

  const bases = calcularBases({
    sabores: e.sabores,
    bachasMananaPorSabor,
    bases: e.bases,
    margenPct: e.margenPct,
    diasCobertura: e.diasCobertura,
  }).map((b) => {
    const editado = e.cocinarOverride?.[b.idProd];
    // Un override inválido (negativo, NaN, infinito) se trata como "sin override".
    if (editado === undefined || !Number.isFinite(editado) || editado < 0) return b;
    // Se redondea a 3 decimales, igual que la columna cant_plan (NUMERIC(12,3)): 0.0004 -> 0.
    return { ...b, kgACocinar: redondear3(editado) };
  });

  return { fabricacion, bases };
}

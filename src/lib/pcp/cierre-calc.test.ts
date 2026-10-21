import { describe, it, expect } from "vitest";
import {
  calcularFabricacion,
  calcularBases,
  calcularCierre,
  type SaborCierre,
  type BaseCierre,
} from "./cierre-calc";

function sabor(parcial: Partial<SaborCierre> = {}): SaborCierre {
  return {
    idProd: 1,
    detalle: "Vainilla",
    pesoEstandar: 4,
    demandaBaseKgDia: 10,
    coccionesPendientes: 0,
    items: [],
    ...parcial,
  };
}

function base(parcial: Partial<BaseCierre> = {}): BaseCierre {
  return {
    idProd: 100,
    detalle: "Base Media",
    stockReal: 0,
    coccionesPendientes: 0,
    loteOptimo: null,
    loteMinimo: null,
    ...parcial,
  };
}

describe("calcularFabricacion", () => {
  it("aplica margen, resta el stock disponible y redondea a bachas enteras", () => {
    const f = calcularFabricacion(sabor(), { kgObrador: 0, kgExhibidaPonderada: 3 }, 20);
    expect(f.demandaManana).toBeCloseTo(12, 5);
    expect(f.stockDisponible).toBeCloseTo(3, 5);
    expect(f.necesario).toBeCloseTo(9, 5);
    expect(f.bachas).toBe(3);
    expect(f.kgAFabricar).toBeCloseTo(12, 5);
  });

  it("suma el stock del obrador al de la bacha exhibida", () => {
    const f = calcularFabricacion(sabor(), { kgObrador: 4, kgExhibidaPonderada: 2 }, 20);
    expect(f.stockDisponible).toBeCloseTo(6, 5);
    expect(f.necesario).toBeCloseTo(6, 5);
    expect(f.bachas).toBe(2);
  });

  it("no fabrica si el stock cubre la demanda", () => {
    const f = calcularFabricacion(sabor(), { kgObrador: 20, kgExhibidaPonderada: 0 }, 20);
    expect(f.necesario).toBeLessThan(0);
    expect(f.bachas).toBe(0);
    expect(f.kgAFabricar).toBe(0);
  });

  it("no cuenta una bacha de más por error de punto flotante", () => {
    // 2.1 / 0.7 = 3.0000000000000004 en punto flotante: tiene que dar 3 bachas, no 4.
    const f = calcularFabricacion(
      sabor({ pesoEstandar: 0.7, demandaBaseKgDia: 2.1 }),
      { kgObrador: 0, kgExhibidaPonderada: 0 },
      0
    );
    expect(f.bachas).toBe(3);
  });

  it("descuenta las OPs de fabricación ya pendientes", () => {
    const f = calcularFabricacion(
      sabor({ coccionesPendientes: 4 }),
      { kgObrador: 0, kgExhibidaPonderada: 3 },
      20
    );
    expect(f.necesario).toBeCloseTo(5, 5);
    expect(f.bachas).toBe(2);
  });

  it("un sabor sin peso estándar no se planifica y queda marcado", () => {
    const f = calcularFabricacion(
      sabor({ pesoEstandar: null }),
      { kgObrador: 0, kgExhibidaPonderada: 0 },
      20
    );
    expect(f.sinPeso).toBe(true);
    expect(f.bachas).toBe(0);
    expect(f.kgAFabricar).toBe(0);
  });
});

describe("calcularBases", () => {
  const vainilla = sabor({ items: [{ idSubprod: 100, cantSubprod: 2 }] });

  it("descongela lo que consume la fabricación, hasta el stock real, y marca el faltante", () => {
    const filas = calcularBases({
      sabores: [vainilla],
      bachasMananaPorSabor: new Map([[1, 3]]),
      bases: [base({ stockReal: 5, loteOptimo: 10, loteMinimo: 20 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    const b = filas[0];
    expect(b.necesidadFabricacion).toBeCloseTo(6, 5);
    expect(b.descongelar).toBeCloseTo(5, 5);
    expect(b.faltante).toBeCloseTo(1, 5);
    expect(b.stockTrasManana).toBeCloseTo(0, 5);
    // consumo diario = 2 * 10 * 1.2 / 4 = 6; objetivo = 6 * 3 = 18
    expect(b.consumoDiario).toBeCloseTo(6, 5);
    expect(b.objetivo).toBeCloseTo(18, 5);
    // a reponer = 18 + 1 - 0 - 0 = 19 -> 2 lotes de 10 = 20
    expect(b.aReponer).toBeCloseTo(19, 5);
    expect(b.kgACocinar).toBeCloseTo(20, 5);
  });

  it("descuenta las cocciones pendientes antes de cocinar", () => {
    const filas = calcularBases({
      sabores: [vainilla],
      bachasMananaPorSabor: new Map([[1, 3]]),
      bases: [base({ stockReal: 5, coccionesPendientes: 5, loteOptimo: 10, loteMinimo: 20 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    // a reponer = 18 + 1 - 0 - 5 = 14 -> 2 lotes de 10 = 20
    expect(filas[0].aReponer).toBeCloseTo(14, 5);
    expect(filas[0].kgACocinar).toBeCloseTo(20, 5);
  });

  it("no cocina si el stock cubre el objetivo", () => {
    const filas = calcularBases({
      sabores: [vainilla],
      bachasMananaPorSabor: new Map([[1, 1]]),
      bases: [base({ stockReal: 100, loteOptimo: 10, loteMinimo: 20 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    expect(filas[0].kgACocinar).toBe(0);
    expect(filas[0].faltante).toBe(0);
  });

  it("respeta el lote mínimo cuando el redondeo al lote óptimo queda corto", () => {
    const filas = calcularBases({
      sabores: [sabor({ items: [{ idSubprod: 100, cantSubprod: 1 }] })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0, loteOptimo: 4, loteMinimo: 20 })],
      margenPct: 0,
      diasCobertura: 2,
    });
    // consumo = 1 * 10 / 4 = 2.5; objetivo = 5 -> 2 lotes de 4 = 8 -> mínimo 20
    expect(filas[0].aReponer).toBeCloseTo(5, 5);
    expect(filas[0].kgACocinar).toBeCloseTo(20, 5);
  });

  it("una base que ninguna receta usa no se descongela ni se cocina", () => {
    const filas = calcularBases({
      sabores: [vainilla],
      bachasMananaPorSabor: new Map([[1, 3]]),
      bases: [base({ idProd: 999, detalle: "Otra", stockReal: 7 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    expect(filas[0].necesidadFabricacion).toBe(0);
    expect(filas[0].descongelar).toBe(0);
    expect(filas[0].kgACocinar).toBe(0);
  });

  it("suma los items de un mismo sabor que usan la misma base", () => {
    const filas = calcularBases({
      sabores: [
        sabor({
          items: [
            { idSubprod: 100, cantSubprod: 2 },
            { idSubprod: 100, cantSubprod: 1 },
          ],
        }),
      ],
      bachasMananaPorSabor: new Map([[1, 3]]),
      bases: [base({ stockReal: 20 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    // por bacha = 2 + 1 = 3; necesidad = 3 * 3 = 9; consumo = 3 * 10 * 1.2 / 4 = 9
    expect(filas[0].necesidadFabricacion).toBeCloseTo(9, 5);
    expect(filas[0].consumoDiario).toBeCloseTo(9, 5);
    expect(filas[0].descongelar).toBeCloseTo(9, 5);
  });

  it("suma la necesidad y el consumo de dos sabores que comparten una base", () => {
    const chocolate = sabor({
      idProd: 2,
      detalle: "Chocolate",
      pesoEstandar: 5,
      demandaBaseKgDia: 20,
      items: [{ idSubprod: 100, cantSubprod: 1.5 }],
    });
    const filas = calcularBases({
      sabores: [vainilla, chocolate],
      bachasMananaPorSabor: new Map([
        [1, 3],
        [2, 2],
      ]),
      bases: [base({ stockReal: 4 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    const b = filas[0];
    // necesidad = 2 * 3 + 1.5 * 2 = 9
    expect(b.necesidadFabricacion).toBeCloseTo(9, 5);
    // consumo = 2 * 10 * 1.2 / 4 + 1.5 * 20 * 1.2 / 5 = 6 + 7.2 = 13.2
    expect(b.consumoDiario).toBeCloseTo(13.2, 5);
    expect(b.descongelar).toBeCloseTo(4, 5);
    expect(b.faltante).toBeCloseTo(5, 5);
    // objetivo = 39.6; a reponer = 39.6 + 5 - 0 - 0 = 44.6 (sin lotes: sin redondeo)
    expect(b.objetivo).toBeCloseTo(39.6, 5);
    expect(b.aReponer).toBeCloseTo(44.6, 5);
    expect(b.kgACocinar).toBeCloseTo(44.6, 5);
  });
});

describe("calcularCierre", () => {
  const entradasBase = {
    margenPct: 20,
    diasCobertura: 3,
    sabores: [sabor({ items: [{ idSubprod: 100, cantSubprod: 2 }] })],
    stockSabores: { 1: { kgObrador: 0, kgExhibidaPonderada: 3 } },
    bases: [base({ stockReal: 5, loteOptimo: 10, loteMinimo: 20 })],
  };

  it("encadena fabricación -> descongelar -> cocinar", () => {
    const r = calcularCierre(entradasBase);
    expect(r.fabricacion[0].bachas).toBe(3);
    expect(r.bases[0].descongelar).toBeCloseTo(5, 5);
    expect(r.bases[0].kgACocinar).toBeCloseTo(20, 5);
  });

  it("si se editan las bachas, el descongelado y la cocción se recalculan", () => {
    const r = calcularCierre({ ...entradasBase, bachasOverride: { 1: 2 } });
    expect(r.fabricacion[0].bachas).toBe(2);
    expect(r.fabricacion[0].kgAFabricar).toBeCloseTo(8, 5);
    // necesidad = 2 * 2 = 4; descongelar 4; faltante 0; stock tras mañana 1
    expect(r.bases[0].descongelar).toBeCloseTo(4, 5);
    expect(r.bases[0].faltante).toBe(0);
    // a reponer = 18 + 0 - 1 - 0 = 17 -> 2 lotes de 10 = 20
    expect(r.bases[0].kgACocinar).toBeCloseTo(20, 5);
  });

  it("la cantidad a cocinar editada pisa la calculada", () => {
    const r = calcularCierre({ ...entradasBase, cocinarOverride: { 100: 30 } });
    expect(r.bases[0].kgACocinar).toBe(30);
  });

  it("las bachas ya pendientes cuentan para el descongelado de mañana", () => {
    const r = calcularCierre({
      ...entradasBase,
      sabores: [sabor({ coccionesPendientes: 4, items: [{ idSubprod: 100, cantSubprod: 2 }] })],
    });
    // necesario = 12 - 3 - 4 = 5 -> 2 bachas nuevas; más 1 pendiente (4 kg / 4) = 3 bachas
    expect(r.fabricacion[0].bachas).toBe(2);
    expect(r.bases[0].necesidadFabricacion).toBeCloseTo(6, 5);
  });

  it("un sabor sin datos de stock se trata como stock cero", () => {
    const r = calcularCierre({ ...entradasBase, stockSabores: {} });
    expect(r.fabricacion[0].stockDisponible).toBe(0);
    expect(r.fabricacion[0].bachas).toBe(3);
  });

  it("las bachas editadas de un sabor sin peso estándar se ignoran", () => {
    const r = calcularCierre({
      ...entradasBase,
      sabores: [sabor({ pesoEstandar: null, items: [{ idSubprod: 100, cantSubprod: 2 }] })],
      bachasOverride: { 1: 5 },
    });
    expect(r.fabricacion[0].sinPeso).toBe(true);
    expect(r.fabricacion[0].bachas).toBe(0);
    expect(r.fabricacion[0].kgAFabricar).toBe(0);
    expect(r.bases[0].necesidadFabricacion).toBe(0);
  });

  it("editar a 0 bachas con cocciones pendientes mantiene el descongelado de las pendientes", () => {
    const r = calcularCierre({
      ...entradasBase,
      sabores: [sabor({ coccionesPendientes: 4, items: [{ idSubprod: 100, cantSubprod: 2 }] })],
      bachasOverride: { 1: 0 },
    });
    expect(r.fabricacion[0].bachas).toBe(0);
    expect(r.fabricacion[0].kgAFabricar).toBe(0);
    // bachas de mañana = 0 nuevas + 4 / 4 pendientes = 1; necesidad = 2 * 1 = 2
    expect(r.bases[0].necesidadFabricacion).toBeCloseTo(2, 5);
    expect(r.bases[0].descongelar).toBeCloseTo(2, 5);
  });

  it("un override de bachas negativo, no entero o no finito se ignora", () => {
    for (const invalido of [-1, 1.5, NaN, Infinity]) {
      const r = calcularCierre({ ...entradasBase, bachasOverride: { 1: invalido } });
      expect(r.fabricacion[0].bachas).toBe(3);
      expect(r.fabricacion[0].kgAFabricar).toBeCloseTo(12, 5);
    }
  });

  it("un override de cocción en 0 deja la cocción en 0", () => {
    const r = calcularCierre({ ...entradasBase, cocinarOverride: { 100: 0 } });
    expect(r.bases[0].kgACocinar).toBe(0);
  });

  it("un override de cocción menor a 0.0005 se redondea a 0 (no se crearía OP)", () => {
    const r = calcularCierre({ ...entradasBase, cocinarOverride: { 100: 0.0004 } });
    expect(r.bases[0].kgACocinar).toBe(0);
  });

  it("un override de cocción negativo o no finito se ignora", () => {
    for (const invalido of [-5, NaN, Infinity]) {
      const r = calcularCierre({ ...entradasBase, cocinarOverride: { 100: invalido } });
      expect(r.bases[0].kgACocinar).toBeCloseTo(20, 5);
    }
  });
});

describe("calcularBases con demanda distinta por día", () => {
  const conItem = (parcial: Partial<SaborCierre> = {}) =>
    sabor({ items: [{ idSubprod: 100, cantSubprod: 2 }], ...parcial });

  it("el objetivo suma el consumo esperado de cada día de la ventana", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaSiguientesKg: [10, 20] })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 2,
    });
    // día 1: 2 × 10 / 4 = 5; día 2: 2 × 20 / 4 = 10 -> objetivo 15, promedio 7,5
    expect(filas[0].objetivo).toBeCloseTo(15, 5);
    expect(filas[0].consumoDiario).toBeCloseTo(7.5, 5);
    expect(filas[0].aReponer).toBeCloseTo(15, 5);
  });

  it("un último día fraccionario pesa solo la fracción", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaSiguientesKg: [10, 20] })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 1.5,
    });
    // 1 × 5 + 0,5 × 10 = 10
    expect(filas[0].objetivo).toBeCloseTo(10, 5);
  });

  it("aplica el margen al consumo de cada día", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaSiguientesKg: [10, 20] })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 20,
      diasCobertura: 2,
    });
    expect(filas[0].objetivo).toBeCloseTo(18, 5); // 15 × 1,2
  });

  it("sin demandaSiguientesKg usa la demanda del día del plan para todos los días", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaBaseKgDia: 10 })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 3,
    });
    // 3 días × (2 × 10 / 4) = 15
    expect(filas[0].objetivo).toBeCloseTo(15, 5);
    expect(filas[0].consumoDiario).toBeCloseTo(5, 5);
  });

  it("con 0 días de cobertura no hay objetivo, pero el consumo diario sigue informado", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaBaseKgDia: 10 })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 0,
    });
    expect(filas[0].objetivo).toBe(0);
    expect(filas[0].consumoDiario).toBeCloseTo(5, 5);
  });

  it("suma el consumo de varios sabores que usan la misma base, cada uno con sus días", () => {
    const filas = calcularBases({
      sabores: [
        conItem({ idProd: 1, demandaSiguientesKg: [10, 20] }),
        sabor({ idProd: 2, pesoEstandar: 5, items: [{ idSubprod: 100, cantSubprod: 1 }], demandaSiguientesKg: [5, 5] }),
      ],
      bachasMananaPorSabor: new Map([[1, 0], [2, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 2,
    });
    // sabor 1: 5 + 10 = 15; sabor 2: 1 × 5 / 5 = 1 por día -> 2; total 17
    expect(filas[0].objetivo).toBeCloseTo(17, 5);
  });
});

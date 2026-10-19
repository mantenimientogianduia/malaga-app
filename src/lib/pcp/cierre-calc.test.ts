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
    // 0.9 / 0.3 = 3.0000000000000004 en punto flotante: tiene que dar 3 bachas, no 4.
    const f = calcularFabricacion(
      sabor({ pesoEstandar: 0.3, demandaBaseKgDia: 0.9 }),
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
});

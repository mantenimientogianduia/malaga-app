import { describe, it, expect } from "vitest";
import {
  DEMANDA_SEMANAL_INICIAL,
  PCT_DIA_INICIAL,
  demandaDiaSabor,
  diaSemanaDeFecha,
  pesosCobertura,
  sumaPct,
} from "./demanda";

describe("demandaDiaSabor", () => {
  it("reparte la demanda semanal por sabor y por día", () => {
    // 550 kg × 6 % del sabor × 13 % del día = 4,29 kg
    expect(demandaDiaSabor(550, 6, 13)).toBeCloseTo(4.29, 5);
    // 550 kg × 6 % × 16 % = 5,28 kg
    expect(demandaDiaSabor(550, 6, 16)).toBeCloseTo(5.28, 5);
  });

  it("devuelve 0 si algún porcentaje es 0", () => {
    expect(demandaDiaSabor(550, 0, 13)).toBe(0);
    expect(demandaDiaSabor(550, 6, 0)).toBe(0);
  });
});

describe("valores iniciales", () => {
  it("la demanda semanal arranca en 550 y los días suman 100 %", () => {
    expect(DEMANDA_SEMANAL_INICIAL).toBe(550);
    expect(PCT_DIA_INICIAL).toEqual([13, 13, 13, 13, 16, 16, 16]);
    expect(sumaPct(PCT_DIA_INICIAL)).toBe(100);
  });
});

describe("diaSemanaDeFecha", () => {
  it("devuelve 1 para lunes y 7 para domingo", () => {
    expect(diaSemanaDeFecha("2026-10-26")).toBe(1);
    expect(diaSemanaDeFecha("2026-10-21")).toBe(3);
    expect(diaSemanaDeFecha("2026-10-25")).toBe(7);
    expect(diaSemanaDeFecha("2030-01-07")).toBe(1);
  });
});

describe("pesosCobertura", () => {
  it("enteros: un peso 1 por día", () => {
    expect(pesosCobertura(3)).toEqual([1, 1, 1]);
    expect(pesosCobertura(1)).toEqual([1]);
  });

  it("fraccionarios: el último día pesa el resto", () => {
    expect(pesosCobertura(2.5)).toEqual([1, 1, 0.5]);
    expect(pesosCobertura(0.3)).toEqual([0.3]);
  });

  it("0 o negativo: sin días", () => {
    expect(pesosCobertura(0)).toEqual([]);
    expect(pesosCobertura(-2)).toEqual([]);
  });

  it("la ventana nunca supera 60 días", () => {
    expect(pesosCobertura(1000)).toHaveLength(60);
  });
});

describe("sumaPct", () => {
  it("suma con dos decimales sin errores de punto flotante", () => {
    expect(sumaPct([0.1, 0.2])).toBe(0.3);
    expect(sumaPct([6, 5.6, 4.2, 5])).toBe(20.8);
    expect(sumaPct([])).toBe(0);
  });
});

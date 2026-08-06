import { describe, it, expect } from "vitest";
import {
  regresionLineal,
  proyectarSiguiente,
  diaSemanaIso,
  redondearArriba,
  calcularNecesario,
  calcularCantidadAPlanificar,
} from "./forecast";

describe("regresionLineal", () => {
  it("una recta perfecta (y = 2x + 1) da pendiente 2 y ordenada 1", () => {
    const r = regresionLineal([1, 3, 5, 7, 9]);
    expect(r.pendiente).toBeCloseTo(2, 5);
    expect(r.ordenada).toBeCloseTo(1, 5);
  });

  it("valores constantes dan pendiente 0", () => {
    const r = regresionLineal([10, 10, 10, 10]);
    expect(r.pendiente).toBeCloseTo(0, 5);
    expect(r.ordenada).toBeCloseTo(10, 5);
  });
});

describe("proyectarSiguiente", () => {
  it("proyecta el siguiente punto de una tendencia lineal", () => {
    // y = 2x + 1 para x=0..4 -> [1,3,5,7,9]; el siguiente (x=5) es 11.
    expect(proyectarSiguiente([1, 3, 5, 7, 9])).toBeCloseTo(11, 5);
  });

  it("con un solo punto, proyecta ese mismo valor", () => {
    expect(proyectarSiguiente([42])).toBe(42);
  });

  it("con cero puntos, proyecta 0", () => {
    expect(proyectarSiguiente([])).toBe(0);
  });
});

describe("diaSemanaIso", () => {
  it("2026-08-05 es miércoles (ISO 3)", () => {
    expect(diaSemanaIso(new Date("2026-08-05T12:00:00Z"))).toBe(3);
  });

  it("2026-08-09 es domingo (ISO 7)", () => {
    expect(diaSemanaIso(new Date("2026-08-09T12:00:00Z"))).toBe(7);
  });

  it("2026-08-10 es lunes (ISO 1)", () => {
    expect(diaSemanaIso(new Date("2026-08-10T12:00:00Z"))).toBe(1);
  });
});

describe("redondearArriba", () => {
  it("redondea hacia arriba al múltiplo del lote óptimo", () => {
    expect(redondearArriba(10.099, 10)).toBe(20);
  });

  it("un valor exacto no cambia", () => {
    expect(redondearArriba(20, 10)).toBe(20);
  });

  it("sin lote óptimo (null), no redondea", () => {
    expect(redondearArriba(10.099, null)).toBe(10.099);
  });

  it("lote óptimo 0 se trata como libre", () => {
    expect(redondearArriba(10.099, 0)).toBe(10.099);
  });
});

describe("calcularNecesario", () => {
  it("caso del spec: demanda 8.89, stock 3.8, mínimo 5, pendientes 0 -> 10.09", () => {
    const necesario = calcularNecesario({
      demanda: 8.89,
      stockActual: 3.8,
      stockMinimo: 5,
      coccionesPendientes: 0,
    });
    expect(necesario).toBeCloseTo(10.09, 5);
  });

  it("descuenta cocciones/OPs pendientes", () => {
    const necesario = calcularNecesario({
      demanda: 20,
      stockActual: 5,
      stockMinimo: 5,
      coccionesPendientes: 15,
    });
    expect(necesario).toBeCloseTo(5, 5);
  });
});

describe("calcularCantidadAPlanificar", () => {
  it("caso del spec: necesario 10.099, lote óptimo 10, lote mínimo 60 -> 60", () => {
    const cantidad = calcularCantidadAPlanificar({ necesario: 10.099, loteOptimo: 10, loteMinimo: 60 });
    expect(cantidad).toBe(60);
  });

  it("necesario negativo o cero no planifica nada", () => {
    expect(calcularCantidadAPlanificar({ necesario: 0, loteOptimo: 10, loteMinimo: 60 })).toBe(0);
    expect(calcularCantidadAPlanificar({ necesario: -5, loteOptimo: 10, loteMinimo: 60 })).toBe(0);
  });

  it("sin lote mínimo, el redondeo al lote óptimo alcanza", () => {
    expect(calcularCantidadAPlanificar({ necesario: 21, loteOptimo: 10, loteMinimo: null })).toBe(30);
  });

  it("todo libre (ambos null) devuelve el necesario tal cual", () => {
    expect(calcularCantidadAPlanificar({ necesario: 12.5, loteOptimo: null, loteMinimo: null })).toBe(12.5);
  });
});

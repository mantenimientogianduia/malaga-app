import { describe, it, expect } from "vitest";
import {
  TEMPERATURA_INICIAL,
  PASO_TEMPERATURA,
  ajustarTemperatura,
  parsearTemperatura,
} from "./stepper";

describe("selector de temperatura", () => {
  it("arranca en -12 y el paso es 0,5", () => {
    expect(TEMPERATURA_INICIAL).toBe(-12);
    expect(PASO_TEMPERATURA).toBe(0.5);
  });

  it("ajustarTemperatura sube y baja de a 0,5", () => {
    expect(ajustarTemperatura(-12, PASO_TEMPERATURA)).toBe(-11.5);
    expect(ajustarTemperatura(-12, -PASO_TEMPERATURA)).toBe(-12.5);
    expect(ajustarTemperatura(-0.5, PASO_TEMPERATURA)).toBe(0);
  });

  it("ajustarTemperatura no arrastra error de punto flotante tras muchos pasos", () => {
    let valor = TEMPERATURA_INICIAL;
    for (let i = 0; i < 20; i++) valor = ajustarTemperatura(valor, PASO_TEMPERATURA);
    expect(valor).toBe(-2);
    for (let i = 0; i < 40; i++) valor = ajustarTemperatura(valor, -PASO_TEMPERATURA);
    expect(valor).toBe(-22);
  });

  it("ajustarTemperatura acepta valores escritos a mano con un decimal", () => {
    expect(ajustarTemperatura(-12.3, PASO_TEMPERATURA)).toBe(-11.8);
    expect(ajustarTemperatura(-12.3, -PASO_TEMPERATURA)).toBe(-12.8);
  });

  it("parsearTemperatura interpreta coma y punto decimal", () => {
    expect(parsearTemperatura("-12,5")).toBe(-12.5);
    expect(parsearTemperatura("-12.5")).toBe(-12.5);
    expect(parsearTemperatura(" -13 ")).toBe(-13);
  });

  it("parsearTemperatura devuelve null si no es un número", () => {
    expect(parsearTemperatura("")).toBeNull();
    expect(parsearTemperatura("   ")).toBeNull();
    expect(parsearTemperatura("abc")).toBeNull();
    expect(parsearTemperatura("-")).toBeNull();
  });
});

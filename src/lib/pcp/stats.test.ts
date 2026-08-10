import { describe, it, expect } from "vitest";
import { generarInsights } from "./stats";

describe("generarInsights", () => {
  it("señala el día de mayor demanda relativo al promedio", () => {
    const insights = generarInsights({
      distribucionDia: { 1: 0.1, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.15, 6: 0.25, 7: 0.2 },
      distribucionProducto: { 1: 0.3, 2: 0.2 },
      productosDetalle: { 1: "Pistacho", 2: "Vainilla" },
      pendiente: 0,
    });
    expect(insights.some((i) => i.includes("Sábado"))).toBe(true);
  });

  it("señala el producto de mayor rotación", () => {
    const insights = generarInsights({
      distribucionDia: {},
      distribucionProducto: { 1: 0.3, 2: 0.2 },
      productosDetalle: { 1: "Pistacho", 2: "Vainilla" },
      pendiente: 0,
    });
    expect(insights.some((i) => i.includes("Pistacho"))).toBe(true);
  });

  it("señala tendencia creciente cuando la pendiente es positiva", () => {
    const insights = generarInsights({
      distribucionDia: {},
      distribucionProducto: {},
      productosDetalle: {},
      pendiente: 5,
    });
    expect(insights.some((i) => i.toLowerCase().includes("creciente"))).toBe(true);
  });

  it("sin datos, no rompe (devuelve arreglo vacío o solo insights que no dependen de datos)", () => {
    const insights = generarInsights({ distribucionDia: {}, distribucionProducto: {}, productosDetalle: {}, pendiente: 0 });
    expect(Array.isArray(insights)).toBe(true);
  });
});

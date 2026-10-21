import { describe, it, expect } from "vitest";
import { PCT_SABORES_INICIALES, emparejarPorNombre, normalizarNombre } from "./seed";
import { sumaPct } from "./demanda";

describe("PCT_SABORES_INICIALES", () => {
  it("son 24 sabores y suman 100 %", () => {
    expect(PCT_SABORES_INICIALES).toHaveLength(24);
    expect(sumaPct(PCT_SABORES_INICIALES.map((s) => s.pct))).toBe(100);
  });
});

describe("normalizarNombre", () => {
  it("ignora mayúsculas, acentos y espacios repetidos", () => {
    expect(normalizarNombre("  Málaga ")).toBe("malaga");
    expect(normalizarNombre("LIMÓN  con   cascaritas")).toBe("limon con cascaritas");
  });
});

describe("emparejarPorNombre", () => {
  it("empareja ignorando mayúsculas y acentos e informa los que no encuentra", () => {
    const productos = [
      { idProd: 1, detalle: "Malaga" },
      { idProd: 2, detalle: "KINDER BUENO" },
      { idProd: 3, detalle: "Otro sabor" },
    ];
    const r = emparejarPorNombre(
      [
        { nombre: "Málaga", pct: 3 },
        { nombre: "Kinder Bueno", pct: 6 },
        { nombre: "Sabor que no existe", pct: 1 },
      ],
      productos
    );
    expect(r.encontrados).toEqual([
      { idProd: 1, nombre: "Málaga", pct: 3 },
      { idProd: 2, nombre: "Kinder Bueno", pct: 6 },
    ]);
    expect(r.noEncontrados).toEqual(["Sabor que no existe"]);
  });
});

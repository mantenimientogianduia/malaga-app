import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto, listProductos } from "./queries";

describe("productos queries", () => {
  beforeEach(async () => {
    await query("TRUNCATE malaga.d_productos RESTART IDENTITY CASCADE");
  });

  it("crea un producto PT con peso_estandar", async () => {
    const p = await createProducto({
      detalle: "Gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    expect(p.idProd).toBeGreaterThan(0);
    expect(p.tipoProducto).toBe("PT");
  });

  it("rechaza un producto PT sin peso_estandar antes de tocar la base", async () => {
    await expect(
      createProducto({ detalle: "Sin peso", unidMed: "kg", tipoProducto: "PT" })
    ).rejects.toThrow(/peso_estandar/);
  });

  it("permite un producto SEMI sin peso_estandar", async () => {
    const p = await createProducto({ detalle: "Pasta", unidMed: "kg", tipoProducto: "SEMI" });
    expect(p.pesoEstandar).toBeNull();
  });

  it("lista productos ordenados por tipo y detalle", async () => {
    await createProducto({
      detalle: "Vainilla",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    await createProducto({ detalle: "Pasta", unidMed: "kg", tipoProducto: "SEMI" });

    const list = await listProductos();
    expect(list.map((p) => p.detalle)).toEqual(["Vainilla", "Pasta"]);
  });
});

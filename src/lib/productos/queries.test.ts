import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto, listProductos, updateProducto, getProducto } from "./queries";

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

  it("crea un producto con stock_minimo en 0 y lotes nulos por defecto", async () => {
    const p = await createProducto({ detalle: "Base Test", unidMed: "kg", tipoProducto: "SEMI" });
    expect(p.stockMinimo).toBe("0.000");
    expect(p.loteOptimo).toBeNull();
    expect(p.loteMinimo).toBeNull();
  });

  it("actualizarProducto guarda stock_minimo, lote_optimo y lote_minimo", async () => {
    const p = await createProducto({ detalle: "Base Test", unidMed: "kg", tipoProducto: "SEMI" });
    await updateProducto(p.idProd, {
      detalle: "Base Test",
      unidMed: "kg",
      activo: true,
      stockMinimo: 5,
      loteOptimo: 10,
      loteMinimo: 60,
    });
    const updated = await getProducto(p.idProd);
    expect(Number(updated!.stockMinimo)).toBe(5);
    expect(Number(updated!.loteOptimo)).toBe(10);
    expect(Number(updated!.loteMinimo)).toBe(60);
  });

  it("lote_optimo y lote_minimo se pueden dejar en null (libre)", async () => {
    const p = await createProducto({ detalle: "Base Libre", unidMed: "kg", tipoProducto: "SEMI" });
    await updateProducto(p.idProd, { detalle: "Base Libre", unidMed: "kg", activo: true, stockMinimo: 0 });
    const updated = await getProducto(p.idProd);
    expect(updated!.loteOptimo).toBeNull();
    expect(updated!.loteMinimo).toBeNull();
  });
});

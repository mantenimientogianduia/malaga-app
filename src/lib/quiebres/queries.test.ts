import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import {
  listSaboresParaQuiebre,
  getQuiebreAbiertoPorProducto,
  crearQuiebre,
  listQuiebresAbiertos,
  listQuiebresResueltos,
} from "./queries";

describe("quiebres queries", () => {
  beforeEach(async () => {
    // malaga.usuarios NO se trunca acá — es la tabla real de cuentas del
    // sistema. Las tablas que le hacen referencia sí se truncan arriba.
    await query(
      "TRUNCATE malaga.f_quiebres, malaga.f_partidas_stock, malaga.d_productos RESTART IDENTITY CASCADE"
    );
    await query("DELETE FROM malaga.usuarios WHERE email = 't@t.com'");
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("listSaboresParaQuiebre marca cuáles tienen bachas pendientes de exhibir", async () => {
    const sinStock = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const conStock = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 4, '2026-08-01', 'L1')`,
      [conStock.idProd]
    );

    const sabores = await listSaboresParaQuiebre();
    expect(sabores.find((s) => s.idProd === sinStock.idProd)!.tieneBachasPendientes).toBe(false);
    expect(sabores.find((s) => s.idProd === conStock.idProd)!.tieneBachasPendientes).toBe(true);
  });

  it("crearQuiebre inserta y getQuiebreAbiertoPorProducto lo encuentra", async () => {
    const userCarga = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });

    await crearQuiebre(producto.idProd, "2026-08-01T10:00:00Z", userCarga);

    const abierto = await getQuiebreAbiertoPorProducto(producto.idProd);
    expect(abierto).not.toBeNull();
    expect(abierto!.productoDetalle).toBe("Vainilla");
    expect(abierto!.userCarga).toBe("t@t.com");
  });

  it("crearQuiebre bloquea un segundo quiebre abierto para el mismo sabor", async () => {
    const userCarga = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });

    await crearQuiebre(producto.idProd, "2026-08-01T10:00:00Z", userCarga);

    await expect(crearQuiebre(producto.idProd, "2026-08-01T12:00:00Z", userCarga)).rejects.toThrow(
      "Ya hay un quiebre abierto para este sabor."
    );
  });

  it("listQuiebresAbiertos devuelve solo los no resueltos, ordenados por antigüedad", async () => {
    const userCarga = await seedUser();
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await crearQuiebre(p1.idProd, "2026-08-01T12:00:00Z", userCarga);
    await crearQuiebre(p2.idProd, "2026-08-01T09:00:00Z", userCarga);

    const abiertos = await listQuiebresAbiertos();
    expect(abiertos.map((q) => q.productoDetalle)).toEqual(["Chocolate", "Vainilla"]);
  });

  it("listQuiebresResueltos calcula los minutos entre ts_quiebre_real y ts_repuesto", async () => {
    const userCarga = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const { idQuiebre } = await crearQuiebre(producto.idProd, "2026-08-01T10:00:00Z", userCarga);
    await query(
      `UPDATE malaga.f_quiebres SET ts_repuesto = '2026-08-01T11:30:00Z' WHERE id_quiebre = $1`,
      [idQuiebre]
    );

    const resueltos = await listQuiebresResueltos();
    expect(resueltos).toHaveLength(1);
    expect(resueltos[0].minutosResolucion).toBe(90);
  });
});

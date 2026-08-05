import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import {
  actualizarMinimo,
  exhibirPartida,
  listPartidasEnObrador,
  listCartillaActual,
  programarCambio,
  cancelarCambioProgramado,
} from "./queries";

describe("exhibidora queries", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("programar un cambio para hoy o antes se aplica al leer la cartilla, guardando el sabor anterior", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await programarCambio(idExhibidora, p2.idProd, "2026-08-05");

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p2.idProd);
    expect(slot.idProdAnt).toBe(p1.idProd);
    expect(slot.idProdFut).toBeNull();
    expect(slot.fechaCambioProgramado).toBeNull();
  });

  it("un cambio programado para el futuro queda pendiente hasta esa fecha", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await programarCambio(idExhibidora, p2.idProd, "2099-01-01");

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p1.idProd);
    expect(slot.idProdFut).toBe(p2.idProd);
    expect(slot.fechaCambioProgramado).toBe("2099-01-01");
  });

  it("cancelar un cambio programado lo limpia sin aplicarlo", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await programarCambio(idExhibidora, p2.idProd, "2099-01-01");
    await cancelarCambioProgramado(idExhibidora);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p1.idProd);
    expect(slot.idProdFut).toBeNull();
    expect(slot.fechaCambioProgramado).toBeNull();
  });

  it("exhibir una partida la hace aparecer en stock vigente y reemplaza a la anterior del mismo slot", async () => {
    const userExhibicion = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [producto.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    const partida1 = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [producto.idProd]
    );
    const partida2 = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-02', 'L2') RETURNING id_partistock`,
      [producto.idProd]
    );

    await exhibirPartida(partida1.rows[0].id_partistock, idExhibidora, userExhibicion);
    let vivo = await query<{ lote: string }>("SELECT lote FROM malaga.v_stock_pt_vivo");
    expect(vivo.rows.map((r) => r.lote)).toEqual(["L1"]);

    await exhibirPartida(partida2.rows[0].id_partistock, idExhibidora, userExhibicion);
    vivo = await query<{ lote: string }>("SELECT lote FROM malaga.v_stock_pt_vivo");
    expect(vivo.rows.map((r) => r.lote)).toEqual(["L2"]);
  });

  it("actualizarMinimo cambia la cantidad_minima del slot", async () => {
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, cantidad_minima) VALUES (1, $1, 2) RETURNING id_exhibidora`,
      [producto.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await actualizarMinimo(idExhibidora, 5);

    const result = await query<{ cantidad_minima: string }>(
      `SELECT cantidad_minima FROM malaga.d_exhibidora WHERE id_exhibidora = $1`,
      [idExhibidora]
    );
    expect(Number(result.rows[0].cantidad_minima)).toBe(5);
  });

  it("listPartidasEnObrador solo muestra partidas PT sin exhibir", async () => {
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1')`,
      [producto.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion)
       VALUES ($1, 4, '2026-08-02', 'L2', now())`,
      [producto.idProd]
    );

    const enObrador = await listPartidasEnObrador();
    expect(enObrador.map((p) => p.lote)).toEqual(["L1"]);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import {
  exhibirPartida,
  listPartidasEnObrador,
  listCartillaActual,
  programarCambio,
  cancelarCambioProgramado,
  oficializarCambio,
} from "./queries";

describe("exhibidora queries", () => {
  beforeEach(async () => {
    // malaga.usuarios NO se trunca acá — es la tabla real de cuentas del
    // sistema. Las tablas que le hacen referencia sí se truncan arriba, así
    // que para cuando se borra la fila de prueba de más abajo ya no hay
    // ninguna fila que la referencie.
    await query(
      "TRUNCATE malaga.f_quiebres, malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE"
    );
    await query("DELETE FROM malaga.usuarios WHERE email = 't@t.com'");
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

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

  it("oficializarCambio aplica el flip manualmente sin esperar la fecha", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await programarCambio(idExhibidora, p2.idProd, "2099-01-01");
    await oficializarCambio(idExhibidora);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p2.idProd);
    expect(slot.idProdAnt).toBe(p1.idProd);
    expect(slot.idProdFut).toBeNull();
    expect(slot.fechaCambioProgramado).toBeNull();
  });

  it("oficializarCambio no hace nada si no hay cambio programado", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await oficializarCambio(idExhibidora);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p1.idProd);
    expect(slot.idProdAnt).toBeNull();
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

  it("exhibirPartida con oficializarCambioAhora aplica el flip de la posición", async () => {
    const userExhibicion = await seedUser();
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01') RETURNING id_exhibidora`,
      [p1.idProd, p2.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;
    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [p1.idProd]
    );

    await exhibirPartida(partida.rows[0].id_partistock, idExhibidora, userExhibicion, true);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p2.idProd);
    expect(slot.idProdAnt).toBe(p1.idProd);
    expect(slot.idProdFut).toBeNull();
  });

  it("exhibirPartida sin oficializarCambioAhora no toca la posición", async () => {
    const userExhibicion = await seedUser();
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01') RETURNING id_exhibidora`,
      [p1.idProd, p2.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;
    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [p1.idProd]
    );

    await exhibirPartida(partida.rows[0].id_partistock, idExhibidora, userExhibicion);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p1.idProd);
    expect(slot.idProdFut).toBe(p2.idProd);
  });

  it("exhibirPartida cierra un quiebre abierto del mismo producto", async () => {
    const userExhibicion = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [producto.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;
    const quiebre = await query<{ id_quiebre: number }>(
      `INSERT INTO malaga.f_quiebres (id_prod, ts_quiebre_real, user_carga)
       VALUES ($1, '2026-08-01T10:00:00Z', $2) RETURNING id_quiebre`,
      [producto.idProd, userExhibicion]
    );
    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [producto.idProd]
    );

    await exhibirPartida(partida.rows[0].id_partistock, idExhibidora, userExhibicion);

    const cerrado = await query<{ ts_repuesto: string | null; id_partida_repuso: number | null }>(
      `SELECT ts_repuesto, id_partida_repuso FROM malaga.f_quiebres WHERE id_quiebre = $1`,
      [quiebre.rows[0].id_quiebre]
    );
    expect(cerrado.rows[0].ts_repuesto).not.toBeNull();
    expect(cerrado.rows[0].id_partida_repuso).toBe(partida.rows[0].id_partistock);
  });

  it("exhibirPartida no hace nada si no hay quiebre abierto para el producto", async () => {
    const userExhibicion = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [producto.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;
    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [producto.idProd]
    );

    await exhibirPartida(partida.rows[0].id_partistock, idExhibidora, userExhibicion);

    const count = await query<{ count: string }>(`SELECT count(*) FROM malaga.f_quiebres`);
    expect(Number(count.rows[0].count)).toBe(0);
  });

  it("listPartidasEnObrador solo muestra partidas PT sin exhibir, con su rol en la posición", async () => {
    const actual = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const entrante = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01')`,
      [actual.idProd, entrante.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1')`,
      [actual.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-02', 'L2')`,
      [entrante.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion)
       VALUES ($1, 4, '2026-08-02', 'L3', now())`,
      [actual.idProd]
    );

    const enObrador = await listPartidasEnObrador();
    expect(enObrador.map((p) => p.lote)).toEqual(["L1", "L2"]);
    expect(enObrador.find((p) => p.lote === "L1")!.rolEnSlot).toBe("actual");
    expect(enObrador.find((p) => p.lote === "L2")!.rolEnSlot).toBe("entrante");
  });
});

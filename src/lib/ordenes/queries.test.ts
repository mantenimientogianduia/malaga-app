import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { createReceta } from "../recetas/queries";
import { createOrdenProduccion, finalizarOrden, getOrdenParaFinalizar, listOrdenes } from "./queries";

describe("ordenes de produccion queries", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  async function seedProductoYReceta(userAlta: number) {
    const pt = await createProducto({
      detalle: "Helado gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    const semi = await createProducto({ detalle: "Pasta gianduia", unidMed: "kg", tipoProducto: "SEMI" });
    await createReceta({
      idProd: pt.idProd,
      items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }],
      userAlta,
    });
    return { pt, semi };
  }

  it("rechaza crear una OP para un producto sin receta activa", async () => {
    const producto = await createProducto({ detalle: "Sin receta", unidMed: "kg", tipoProducto: "SEMI" });
    await expect(
      createOrdenProduccion({ idProd: producto.idProd, cantPlan: 4, fechaPlan: "2026-08-05" })
    ).rejects.toThrow(/receta activa/);
  });

  it("crea una OP planificada tomando la receta activa del producto", async () => {
    const userAlta = await seedUser();
    const { pt } = await seedProductoYReceta(userAlta);

    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    expect(idOp).toBeGreaterThan(0);

    const ordenes = await listOrdenes();
    expect(ordenes).toHaveLength(1);
    expect(ordenes[0].estado).toBe("planificada");
  });

  it("finalizar una OP genera exactamente una partida y registra el consumo", async () => {
    const userAlta = await seedUser();
    const { pt, semi } = await seedProductoYReceta(userAlta);

    const semiPartida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 5, '2026-08-01', 'SEMI-L1') RETURNING id_partistock`,
      [semi.idProd]
    );
    const idPartidaSemi = semiPartida.rows[0].id_partistock;

    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    const detalle = await getOrdenParaFinalizar(idOp);
    expect(detalle?.items).toHaveLength(1);

    const { idPartida } = await finalizarOrden({
      idOp,
      cantReal: 4,
      lote: "PT-L1",
      fechaFab: "2026-08-05",
      userFin: userAlta,
      consumos: [
        {
          idDetalleReceta: detalle!.items[0].idDetalleReceta,
          idSubprod: semi.idProd,
          idPartidaSubprod: idPartidaSemi,
          cantSubprod: 0.5,
        },
      ],
    });

    expect(idPartida).toBeGreaterThan(0);

    const partidaResult = await query<{ id_op_origen: number }>(
      `SELECT id_op_origen FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [idPartida]
    );
    expect(partidaResult.rows[0].id_op_origen).toBe(idOp);

    const trazaResult = await query<{ cant_subprod: string }>(
      `SELECT cant_subprod FROM malaga.f_trazabilidad_op WHERE id_op = $1`,
      [idOp]
    );
    expect(trazaResult.rows).toHaveLength(1);
    expect(Number(trazaResult.rows[0].cant_subprod)).toBe(0.5);

    const ordenes = await listOrdenes();
    expect(ordenes[0].estado).toBe("finalizada");
  });

  it("permite registrar un consumo mayor al stock disponible (nunca bloquea)", async () => {
    const userAlta = await seedUser();
    const { pt, semi } = await seedProductoYReceta(userAlta);

    const semiPartida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 0.2, '2026-08-01', 'SEMI-L1') RETURNING id_partistock`,
      [semi.idProd]
    );
    const idPartidaSemi = semiPartida.rows[0].id_partistock;

    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    const detalle = await getOrdenParaFinalizar(idOp);

    // La partida solo tiene 0.2kg pero se consumen 0.5kg — no debe lanzar error.
    await expect(
      finalizarOrden({
        idOp,
        cantReal: 4,
        lote: "PT-L1",
        fechaFab: "2026-08-05",
        userFin: userAlta,
        consumos: [
          {
            idDetalleReceta: detalle!.items[0].idDetalleReceta,
            idSubprod: semi.idProd,
            idPartidaSubprod: idPartidaSemi,
            cantSubprod: 0.5,
          },
        ],
      })
    ).resolves.toBeDefined();
  });

  it("rechaza finalizar una OP que ya está finalizada", async () => {
    const userAlta = await seedUser();
    const { pt } = await seedProductoYReceta(userAlta);
    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });

    await finalizarOrden({ idOp, cantReal: 4, lote: "PT-L1", fechaFab: "2026-08-05", userFin: userAlta, consumos: [] });

    await expect(
      finalizarOrden({ idOp, cantReal: 4, lote: "PT-L2", fechaFab: "2026-08-05", userFin: userAlta, consumos: [] })
    ).rejects.toThrow(/ya fue finalizada/);
  });
});

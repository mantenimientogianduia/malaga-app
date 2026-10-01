import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { createReceta } from "../recetas/queries";
import {
  createOrdenProduccion,
  finalizarOrden,
  getOrdenParaFinalizar,
  listOrdenes,
  iniciarOrdenRapido,
  iniciarOrdenConHorario,
  deshacerInicio,
} from "./queries";

describe("ordenes de produccion queries", () => {
  beforeEach(async () => {
    // malaga.usuarios NO se trunca acá — es la tabla real de cuentas del
    // sistema. Las tablas que le hacen referencia sí se truncan arriba.
    await query(
      "TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_productos RESTART IDENTITY CASCADE"
    );
    await query("DELETE FROM malaga.usuarios WHERE email = 't@t.com'");
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
      codigo: "PT-HEL-1",
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

  it("permite crear una OP para un producto sin receta activa (queda sin ingredientes que descontar)", async () => {
    const producto = await createProducto({ detalle: "Sin receta", unidMed: "kg", tipoProducto: "SEMI" });
    const { idOp } = await createOrdenProduccion({ idProd: producto.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    expect(idOp).toBeGreaterThan(0);

    const detalle = await getOrdenParaFinalizar(idOp);
    expect(detalle?.items).toHaveLength(0);
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

  it("iniciar rápido pasa la OP a en_proceso con ts_ini seteado", async () => {
    const userAlta = await seedUser();
    const { pt } = await seedProductoYReceta(userAlta);
    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });

    await iniciarOrdenRapido(idOp, userAlta);

    const ordenes = await listOrdenes();
    expect(ordenes[0].estado).toBe("en_proceso");
    expect(ordenes[0].tsIni).not.toBeNull();
  });

  it("no permite iniciar dos veces la misma OP", async () => {
    const userAlta = await seedUser();
    const { pt } = await seedProductoYReceta(userAlta);
    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });

    await iniciarOrdenRapido(idOp, userAlta);
    await expect(iniciarOrdenRapido(idOp, userAlta)).rejects.toThrow(/no se puede iniciar/);
  });

  it("iniciar con horario respeta el instante ISO elegido (ya convertido por el navegador)", async () => {
    const userAlta = await seedUser();
    const { pt } = await seedProductoYReceta(userAlta);
    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });

    await iniciarOrdenConHorario(idOp, "2026-08-05T07:00:00.000Z", userAlta);

    const ordenes = await listOrdenes();
    expect(ordenes[0].estado).toBe("en_proceso");
    expect(ordenes[0].tsIni).toBe("2026-08-05T07:00:00.000Z");
  });

  it("deshacer inicio vuelve la OP a planificada y limpia ts_ini", async () => {
    const userAlta = await seedUser();
    const { pt } = await seedProductoYReceta(userAlta);
    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    await iniciarOrdenRapido(idOp, userAlta);

    await deshacerInicio(idOp);

    const ordenes = await listOrdenes();
    expect(ordenes[0].estado).toBe("planificada");
    expect(ordenes[0].tsIni).toBeNull();
  });

  it("finalizar una OP genera exactamente una partida, un lote automático y registra el consumo", async () => {
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
      tsIni: "2026-08-05T09:00:00.000Z",
      tsFin: "2026-08-05T10:53:15.000Z",
      tsFinLocal: "2026-08-05T10:53:15",
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

    const partidaResult = await query<{ id_op_origen: number; lote: string; fecha_fab: string }>(
      `SELECT id_op_origen, lote, fecha_fab::text FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [idPartida]
    );
    expect(partidaResult.rows[0].id_op_origen).toBe(idOp);
    expect(partidaResult.rows[0].lote).toBe("PT-HEL-105/08/2026 10:53:15");
    expect(partidaResult.rows[0].fecha_fab).toBe("2026-08-05");

    const trazaResult = await query<{ cant_subprod: string; id_parti_subprod: number | null }>(
      `SELECT cant_subprod, id_parti_subprod FROM malaga.f_trazabilidad_op WHERE id_op = $1`,
      [idOp]
    );
    expect(trazaResult.rows).toHaveLength(1);
    expect(Number(trazaResult.rows[0].cant_subprod)).toBe(0.5);
    expect(trazaResult.rows[0].id_parti_subprod).toBe(idPartidaSemi);

    const ordenes = await listOrdenes();
    expect(ordenes[0].estado).toBe("finalizada");
  });

  it("permite registrar un consumo sin partida elegida (sin lote, con advertencia en UI)", async () => {
    const userAlta = await seedUser();
    const { pt, semi } = await seedProductoYReceta(userAlta);

    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    const detalle = await getOrdenParaFinalizar(idOp);

    await expect(
      finalizarOrden({
        idOp,
        cantReal: 4,
        tsIni: "2026-08-05T09:00:00.000Z",
        tsFin: "2026-08-05T09:30:00.000Z",
        tsFinLocal: "2026-08-05T09:30",
        userFin: userAlta,
        consumos: [
          {
            idDetalleReceta: detalle!.items[0].idDetalleReceta,
            idSubprod: semi.idProd,
            idPartidaSubprod: null,
            cantSubprod: 0.5,
          },
        ],
      })
    ).resolves.toBeDefined();

    const trazaResult = await query<{ id_parti_subprod: number | null }>(
      `SELECT id_parti_subprod FROM malaga.f_trazabilidad_op WHERE id_op = $1`,
      [idOp]
    );
    expect(trazaResult.rows[0].id_parti_subprod).toBeNull();
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
        tsIni: "2026-08-05T09:00:00.000Z",
        tsFin: "2026-08-05T09:30:00.000Z",
        tsFinLocal: "2026-08-05T09:30",
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

    await finalizarOrden({
      idOp,
      cantReal: 4,
      tsIni: "2026-08-05T09:00:00.000Z",
      tsFin: "2026-08-05T09:30:00.000Z",
      tsFinLocal: "2026-08-05T09:30",
      userFin: userAlta,
      consumos: [],
    });

    await expect(
      finalizarOrden({
        idOp,
        cantReal: 4,
        tsIni: "2026-08-05T09:00:00.000Z",
        tsFin: "2026-08-05T09:45:00.000Z",
        tsFinLocal: "2026-08-05T09:45",
        userFin: userAlta,
        consumos: [],
      })
    ).rejects.toThrow(/ya fue finalizada/);
  });
});

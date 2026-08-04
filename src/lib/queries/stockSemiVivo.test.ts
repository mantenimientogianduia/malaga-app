import { describe, it, expect, beforeEach } from "vitest";
import { query, withTransaction } from "../db";

describe("v_stock_semi_vivo", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_productos RESTART IDENTITY CASCADE"
    );
  });

  it("descuenta el consumo acumulado y excluye partidas agotadas", async () => {
    let idPartida: number;

    await withTransaction(async (client) => {
      const semi = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto) VALUES ('Pasta de gianduia', 'kg', 'SEMI') RETURNING id_prod`
      );
      const idSemi = semi.rows[0].id_prod;

      const pt = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto, peso_estandar)
         VALUES ('Helado gianduia', 'kg', 'PT', 4) RETURNING id_prod`
      );
      const idPt = pt.rows[0].id_prod;

      const receta = await client.query(
        `INSERT INTO malaga.recetas (id_prod, version) VALUES ($1, 1) RETURNING id_receta`,
        [idPt]
      );
      const idReceta = receta.rows[0].id_receta;

      const detalle = await client.query(
        `INSERT INTO malaga.recetas_detalles (id_receta, id_prod_padre, id_subprod, cant_subprod)
         VALUES ($1, $2, $3, 0.5) RETURNING id_det_receta`,
        [idReceta, idPt, idSemi]
      );
      const idDetalle = detalle.rows[0].id_det_receta;

      const partida = await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
         VALUES ($1, 5, '2026-08-01', 'SEMI-L1') RETURNING id_partistock`,
        [idSemi]
      );
      idPartida = partida.rows[0].id_partistock;

      const op = await client.query(
        `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado)
         VALUES ($1, $2, 10, '2026-08-02', 'finalizada') RETURNING id_op`,
        [idPt, idReceta]
      );
      const idOp = op.rows[0].id_op;

      await client.query(
        `INSERT INTO malaga.f_trazabilidad_op
           (id_op, id_receta, id_detalle_receta, id_subprod, cant_subprod, id_parti_subprod, id_prod_op)
         VALUES ($1, $2, $3, $4, 4.5, $5, $6)`,
        [idOp, idReceta, idDetalle, idSemi, idPartida, idPt]
      );
    });

    const result = await query<{ restante: string }>(
      "SELECT restante FROM malaga.v_stock_semi_vivo WHERE id_partistock = $1",
      [idPartida!]
    );
    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].restante)).toBeCloseTo(0.5, 3);
  });
});

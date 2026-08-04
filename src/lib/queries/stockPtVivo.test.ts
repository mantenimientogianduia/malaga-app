import { describe, it, expect, beforeEach } from "vitest";
import { query, withTransaction } from "../db";

describe("v_stock_pt_vivo", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE"
    );
  });

  it("solo muestra la partida más reciente exhibida por slot", async () => {
    await withTransaction(async (client) => {
      const prod = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto, peso_estandar)
         VALUES ('Gianduia', 'kg', 'PT', 4) RETURNING id_prod`
      );
      const idProd = prod.rows[0].id_prod;

      const exhib = await client.query(
        `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
        [idProd]
      );
      const idExhibidora = exhib.rows[0].id_exhibidora;

      await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion, id_exhibidora)
         VALUES ($1, 5, '2026-08-01', 'L1', '2026-08-01 08:00:00+00', $2)`,
        [idProd, idExhibidora]
      );
      await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion, id_exhibidora)
         VALUES ($1, 5, '2026-08-02', 'L2', '2026-08-02 08:00:00+00', $2)`,
        [idProd, idExhibidora]
      );
    });

    const result = await query<{ lote: string }>("SELECT lote FROM malaga.v_stock_pt_vivo");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].lote).toBe("L2");
  });
});

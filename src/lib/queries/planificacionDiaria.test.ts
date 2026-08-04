import { describe, it, expect, beforeEach } from "vitest";
import { query, withTransaction } from "../db";

describe("v_planificacion_diaria", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE"
    );
  });

  it("redondea el faltante hacia arriba en bachas de peso_estandar (10kg faltantes, bacha de 4kg -> 3 OP, 12kg)", async () => {
    let idExhibidora: number;

    await withTransaction(async (client) => {
      const prod = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto, peso_estandar)
         VALUES ('Pistacho', 'kg', 'PT', 4) RETURNING id_prod`
      );
      const idProd = prod.rows[0].id_prod;

      const exhib = await client.query(
        `INSERT INTO malaga.d_exhibidora (nro, id_prod, cantidad_minima)
         VALUES (7, $1, 10) RETURNING id_exhibidora`,
        [idProd]
      );
      idExhibidora = exhib.rows[0].id_exhibidora;
      // Sin partidas cargadas: stock_actual = 0, faltante = 10kg completos.
    });

    const result = await query<{ bachas_sugeridas: string; cantidad_sugerida: string; faltante: string }>(
      "SELECT bachas_sugeridas, cantidad_sugerida, faltante FROM malaga.v_planificacion_diaria WHERE id_exhibidora = $1",
      [idExhibidora!]
    );
    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].faltante)).toBeCloseTo(10, 3);
    expect(Number(result.rows[0].bachas_sugeridas)).toBe(3);
    expect(Number(result.rows[0].cantidad_sugerida)).toBeCloseTo(12, 3);
  });

  it("no sugiere bachas cuando el stock ya cubre el mínimo", async () => {
    let idExhibidora: number;

    await withTransaction(async (client) => {
      const prod = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto, peso_estandar)
         VALUES ('Vainilla', 'kg', 'PT', 4) RETURNING id_prod`
      );
      const idProd = prod.rows[0].id_prod;

      const exhib = await client.query(
        `INSERT INTO malaga.d_exhibidora (nro, id_prod, cantidad_minima)
         VALUES (8, $1, 3) RETURNING id_exhibidora`,
        [idProd]
      );
      idExhibidora = exhib.rows[0].id_exhibidora;

      await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion, id_exhibidora)
         VALUES ($1, 5, '2026-08-01', 'L1', '2026-08-01 08:00:00+00', $2)`,
        [idProd, idExhibidora]
      );
    });

    const result = await query<{ bachas_sugeridas: string }>(
      "SELECT bachas_sugeridas FROM malaga.v_planificacion_diaria WHERE id_exhibidora = $1",
      [idExhibidora!]
    );
    expect(Number(result.rows[0].bachas_sugeridas)).toBe(0);
  });
});

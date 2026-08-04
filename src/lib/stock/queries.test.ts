import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { cerrarRemanenteSemi, listStockSemiVivo } from "./queries";

describe("stock queries", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("cerrar el remanente de una partida SEMI la saca del stock vivo", async () => {
    const userBaja = await seedUser();
    const semi = await createProducto({ detalle: "Pasta gianduia", unidMed: "kg", tipoProducto: "SEMI" });

    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 0.3, '2026-08-01', 'SEMI-L1') RETURNING id_partistock`,
      [semi.idProd]
    );
    const idPartida = partida.rows[0].id_partistock;

    let vivo = await listStockSemiVivo();
    expect(vivo.map((v) => v.idPartida)).toContain(idPartida);

    await cerrarRemanenteSemi(idPartida, "scrap", userBaja);

    vivo = await listStockSemiVivo();
    expect(vivo.map((v) => v.idPartida)).not.toContain(idPartida);
  });
});

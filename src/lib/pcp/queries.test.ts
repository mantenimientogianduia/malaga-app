import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { getExhibicionesPorSemana, getDistribucionPorDia, getDistribucionPorProducto } from "./queries";

describe("pcp queries — históricos", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE"
    );
  });

  async function exhibir(idProd: number, ts: string, cantidad: number) {
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion)
       VALUES ($1, $2, $3::date, 'L', $3::timestamptz)`,
      [idProd, cantidad, ts]
    );
  }

  it("getExhibicionesPorSemana suma cantidad de PT exhibida por semana, semanas completas nada más", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    // Semana pasada completa (lunes 2026-07-27).
    await exhibir(p.idProd, "2026-07-27T10:00:00Z", 10);
    await exhibir(p.idProd, "2026-07-29T10:00:00Z", 5);
    // Semana actual (no debe contarse como completa): usamos "ahora" real, así que
    // insertamos con fecha muy futura para asegurarnos de que cae en la semana en curso
    // sea cual sea la fecha real de ejecución del test.
    const hoy = new Date();
    await exhibir(p.idProd, hoy.toISOString(), 999);

    const semanas = await getExhibicionesPorSemana(8);
    const totalSemanaActual = semanas.find((s) => {
      const inicioSemana = new Date(s.semana);
      const diff = (hoy.getTime() - inicioSemana.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff < 7;
    });
    expect(totalSemanaActual).toBeUndefined();
  });

  it("getDistribucionPorDia reparte % entre los días con exhibiciones", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    // 2026-07-27 es lunes (ISO 1), 2026-07-28 es martes (ISO 2).
    await exhibir(p.idProd, "2026-07-27T10:00:00Z", 30);
    await exhibir(p.idProd, "2026-07-28T10:00:00Z", 70);

    const distribucion = await getDistribucionPorDia(8);
    expect(distribucion[1]).toBeCloseTo(0.3, 5);
    expect(distribucion[2]).toBeCloseTo(0.7, 5);
  });

  it("getDistribucionPorProducto solo considera productos actualmente en cartilla", async () => {
    const enCartilla = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const fueraDeCartilla = await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [enCartilla.idProd]);

    await exhibir(enCartilla.idProd, "2026-07-27T10:00:00Z", 40);
    await exhibir(fueraDeCartilla.idProd, "2026-07-27T10:00:00Z", 60);

    const distribucion = await getDistribucionPorProducto(8);
    expect(distribucion[enCartilla.idProd]).toBeCloseTo(1, 5);
    expect(distribucion[fueraDeCartilla.idProd]).toBeUndefined();
  });
});

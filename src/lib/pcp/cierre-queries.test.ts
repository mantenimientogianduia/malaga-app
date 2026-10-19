import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import {
  getConfigPcp,
  updateConfigPcp,
  listDemandaBase,
  setDemandaBase,
} from "./cierre-queries";

// malaga.usuarios NO se trunca nunca: es la tabla real de cuentas. Se borra solo la
// fila de prueba, después de vaciar las tablas que la referencian.
async function limpiar() {
  await query(
    `TRUNCATE malaga.f_cierre_dia_base, malaga.f_cierre_dia_sabor, malaga.f_cierre_dia_bacha, malaga.f_cierre_dia,
              malaga.f_pcp_pronostico, malaga.pcp_demanda_base, malaga.f_trazabilidad_op, malaga.f_partidas_stock,
              malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_exhibidora,
              malaga.d_productos RESTART IDENTITY CASCADE`
  );
  await query(`DELETE FROM malaga.usuarios WHERE email = 'cierre@t.com'`);
  await query(`UPDATE malaga.pcp_config SET margen_pct = 20, dias_cobertura = 3 WHERE id = 1`);
}

describe("cierre queries — configuración y demanda base", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("getConfigPcp devuelve el margen y los días de cobertura", async () => {
    const config = await getConfigPcp();
    expect(config.margenPct).toBe(20);
    expect(config.diasCobertura).toBe(3);
  });

  it("updateConfigPcp actualiza el margen y los días de cobertura", async () => {
    await updateConfigPcp(15, 4);
    const config = await getConfigPcp();
    expect(config.margenPct).toBe(15);
    expect(config.diasCobertura).toBe(4);
  });

  it("listDemandaBase trae los sabores de cartilla y programados con 0 por defecto", async () => {
    const actual = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const futuro = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01')`,
      [actual.idProd, futuro.idProd]
    );

    const filas = await listDemandaBase();
    expect(filas.map((f) => f.detalle)).toEqual(["Chocolate", "Vainilla"]);
    expect(filas.every((f) => f.kgDia === 0)).toBe(true);
  });

  it("setDemandaBase crea o actualiza los kg por día de un sabor", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [p.idProd]);

    await setDemandaBase(p.idProd, 12.5);
    expect((await listDemandaBase())[0].kgDia).toBe(12.5);

    await setDemandaBase(p.idProd, 8);
    expect((await listDemandaBase())[0].kgDia).toBe(8);
  });
});

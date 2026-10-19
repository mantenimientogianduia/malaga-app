import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { createReceta } from "../recetas/queries";
import { listPartidasEnObrador } from "../exhibidora/queries";
import {
  getConfigPcp,
  updateConfigPcp,
  listDemandaBase,
  setDemandaBase,
  listBachasObrador,
  listBachasExhibidas,
  getStockTeoricoBases,
  getDatosCierre,
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

async function seedUser() {
  const r = await query<{ id_user: number }>(
    `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('cierre@t.com', 'x', 'admin') RETURNING id_user`
  );
  return r.rows[0].id_user;
}

async function crearPartidaPt(idProd: number, cantidad: number, lote: string) {
  const r = await query<{ id_partistock: number }>(
    `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
     VALUES ($1, $2, '2026-10-01', $3) RETURNING id_partistock`,
    [idProd, cantidad, lote]
  );
  return r.rows[0].id_partistock;
}

async function exhibir(idPartida: number, idExhibidora: number, idUser: number, tsExhibicion = "now()") {
  await query(
    `UPDATE malaga.f_partidas_stock
     SET ts_exhibicion = ${tsExhibicion}, id_exhibidora = $2, user_exhibicion = $3
     WHERE id_partistock = $1`,
    [idPartida, idExhibidora, idUser]
  );
}

describe("cierre queries — datos del cierre", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("listBachasObrador trae solo PT sin exhibir y sin baja", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const userId = await seedUser();
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p.idProd]
    );
    const enObrador = await crearPartidaPt(p.idProd, 4, "L1");
    const exhibida = await crearPartidaPt(p.idProd, 4, "L2");
    const conBaja = await crearPartidaPt(p.idProd, 4, "L3");
    await exhibir(exhibida, exhib.rows[0].id_exhibidora, userId);
    await query(
      `UPDATE malaga.f_partidas_stock SET ts_baja_manual = now(), motivo_baja_manual = 'ajuste', user_baja_manual = $2 WHERE id_partistock = $1`,
      [conBaja, userId]
    );

    const bachas = await listBachasObrador();
    expect(bachas.map((b) => b.idPartida)).toEqual([enObrador]);
    expect(bachas[0].cantidad).toBe(4);
    expect(bachas[0].detalle).toBe("Vainilla");
  });

  it("listPartidasEnObrador (pantalla Exhibir) también excluye partidas dadas de baja", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const userId = await seedUser();
    const visible = await crearPartidaPt(p.idProd, 4, "L1");
    const conBaja = await crearPartidaPt(p.idProd, 4, "L2");
    await query(
      `UPDATE malaga.f_partidas_stock SET ts_baja_manual = now(), motivo_baja_manual = 'ajuste', user_baja_manual = $2 WHERE id_partistock = $1`,
      [conBaja, userId]
    );

    const partidas = await listPartidasEnObrador();
    expect(partidas.map((x) => x.idPartida)).toEqual([visible]);
  });

  it("listBachasExhibidas trae solo la última bacha exhibida de cada posición", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const userId = await seedUser();
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (3, $1) RETURNING id_exhibidora`,
      [p.idProd]
    );
    const vieja = await crearPartidaPt(p.idProd, 4, "L1");
    const actual = await crearPartidaPt(p.idProd, 5, "L2");
    await exhibir(vieja, exhib.rows[0].id_exhibidora, userId, "now() - interval '2 days'");
    await exhibir(actual, exhib.rows[0].id_exhibidora, userId, "now()");

    const bachas = await listBachasExhibidas();
    expect(bachas).toHaveLength(1);
    expect(bachas[0].idPartida).toBe(actual);
    expect(bachas[0].cantidad).toBe(5);
    expect(bachas[0].nroPosicion).toBe(3);
  });

  it("getStockTeoricoBases sin cierre previo usa el stock por lotes", async () => {
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 7, '2026-10-01', 'B1')`,
      [semi.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 3, '2026-10-01', 'B2')`,
      [semi.idProd]
    );

    const bases = await getStockTeoricoBases();
    const fila = bases.find((b) => b.idProd === semi.idProd)!;
    expect(fila.stockTeorico).toBe(10);
  });

  it("getStockTeoricoBases con cierre previo = real + producido - consumido - bajas", async () => {
    const userId = await seedUser();
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 2 }], userAlta: userId });
    const receta = await query<{ id_receta: number; id_det_receta: number }>(
      `SELECT r.id_receta, rd.id_det_receta FROM malaga.recetas r
       JOIN malaga.recetas_detalles rd ON rd.id_receta = r.id_receta WHERE r.id_prod = $1`,
      [pt.idProd]
    );

    // Cierre anterior de hace 2 días: la base tenía 50 kg reales.
    const cierre = await query<{ id_cierre: number }>(
      `INSERT INTO malaga.f_cierre_dia (fecha, fecha_plan, ts_cierre, user_cierre, margen_pct, dias_cobertura)
       VALUES (CURRENT_DATE - 2, CURRENT_DATE - 1, now() - interval '2 days', $1, 20, 3) RETURNING id_cierre`,
      [userId]
    );
    await query(
      `INSERT INTO malaga.f_cierre_dia_base (id_cierre, id_prod, stock_teorico, stock_real, descongelar, faltante, cocinar)
       VALUES ($1, $2, 0, 50, 0, 0, 0)`,
      [cierre.rows[0].id_cierre, semi.idProd]
    );

    // Producido después del cierre: una cocción de 30 kg.
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 30, CURRENT_DATE, 'B-NUEVA')`,
      [semi.idProd]
    );
    // Consumido después del cierre: una OP de fabricación finalizada usó 12 kg (sin lote elegido).
    const op = await query<{ id_op: number }>(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado, ts_fin)
       VALUES ($1, $2, 4, CURRENT_DATE, 'finalizada', now() - interval '1 hour') RETURNING id_op`,
      [pt.idProd, receta.rows[0].id_receta]
    );
    await query(
      `INSERT INTO malaga.f_trazabilidad_op (id_op, id_receta, id_detalle_receta, id_subprod, cant_subprod, id_parti_subprod, id_prod_op)
       VALUES ($1, $2, $3, $4, 12, NULL, $5)`,
      [op.rows[0].id_op, receta.rows[0].id_receta, receta.rows[0].id_det_receta, semi.idProd, pt.idProd]
    );
    // Baja manual después del cierre de un lote de 10 kg que existía antes.
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_ingreso, ts_baja_manual, motivo_baja_manual, user_baja_manual)
       VALUES ($1, 10, CURRENT_DATE - 5, 'B-VIEJA', now() - interval '3 days', now(), 'vencido', $2)`,
      [semi.idProd, userId]
    );

    const bases = await getStockTeoricoBases();
    const fila = bases.find((b) => b.idProd === semi.idProd)!;
    expect(fila.stockTeorico).toBe(58); // 50 + 30 - 12 - 10
  });

  it("getDatosCierre arma sabores, bachas y bases para la pantalla", async () => {
    const userId = await seedUser();
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(`UPDATE malaga.d_productos SET lote_optimo = 10, lote_minimo = 20 WHERE id_prod = $1`, [semi.idProd]);
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 2 }], userAlta: userId });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [pt.idProd]);
    await setDemandaBase(pt.idProd, 10);
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado) VALUES ($1, 8, CURRENT_DATE, 'planificada')`,
      [pt.idProd]
    );

    const datos = await getDatosCierre();
    expect(datos.margenPct).toBe(20);
    expect(datos.diasCobertura).toBe(3);
    expect(datos.sabores).toHaveLength(1);
    expect(datos.sabores[0]).toMatchObject({
      idProd: pt.idProd,
      detalle: "Vainilla",
      pesoEstandar: 4,
      demandaBaseKgDia: 10,
      coccionesPendientes: 8,
    });
    expect(datos.sabores[0].items).toEqual([{ idSubprod: semi.idProd, cantSubprod: 2 }]);
    expect(datos.bases).toHaveLength(1);
    expect(datos.bases[0]).toMatchObject({
      idProd: semi.idProd,
      detalle: "Base Media",
      stockTeorico: 0,
      coccionesPendientes: 0,
      loteOptimo: 10,
      loteMinimo: 20,
    });
  });
});

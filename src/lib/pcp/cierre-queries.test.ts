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
  confirmarCierre,
  getPlanDelDia,
  type ConfirmarCierreInput,
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

async function crearCierre(userId: number, diasAtras: number) {
  const r = await query<{ id_cierre: number }>(
    `INSERT INTO malaga.f_cierre_dia (fecha, fecha_plan, ts_cierre, user_cierre, margen_pct, dias_cobertura)
     VALUES (CURRENT_DATE - $2::int, CURRENT_DATE - $2::int + 1, now() - ($2::int * interval '1 day'), $1, 20, 3)
     RETURNING id_cierre`,
    [userId, diasAtras]
  );
  return r.rows[0].id_cierre;
}

async function cierreBase(idCierre: number, idProd: number, stockReal: number) {
  await query(
    `INSERT INTO malaga.f_cierre_dia_base (id_cierre, id_prod, stock_teorico, stock_real, descongelar, faltante, cocinar)
     VALUES ($1, $2, 0, $3, 0, 0, 0)`,
    [idCierre, idProd, stockReal]
  );
}

async function crearPartidaSemi(idProd: number, cantidad: number, lote: string, tsIngreso: string) {
  await query(
    `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_ingreso)
     VALUES ($1, $2, CURRENT_DATE, $3, ${tsIngreso})`,
    [idProd, cantidad, lote]
  );
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

  it("listBachasExhibidas devuelve una fila por posición aunque dos posiciones tengan el mismo sabor", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const userId = await seedUser();
    const e2 = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (2, $1) RETURNING id_exhibidora`,
      [p.idProd]
    );
    const e1 = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p.idProd]
    );
    const a = await crearPartidaPt(p.idProd, 4, "L1");
    const b = await crearPartidaPt(p.idProd, 3, "L2");
    await exhibir(a, e1.rows[0].id_exhibidora, userId);
    await exhibir(b, e2.rows[0].id_exhibidora, userId);

    const bachas = await listBachasExhibidas();
    expect(bachas.map((x) => [x.nroPosicion, x.idPartida, x.cantidad])).toEqual([
      [1, a, 4],
      [2, b, 3],
    ]);
  });

  it("getStockTeoricoBases excluye las bases inactivas", async () => {
    const activa = await createProducto({ detalle: "Base Activa", unidMed: "kg", tipoProducto: "SEMI" });
    const inactiva = await createProducto({ detalle: "Base Inactiva", unidMed: "kg", tipoProducto: "SEMI" });
    await query(`UPDATE malaga.d_productos SET activo = false WHERE id_prod = $1`, [inactiva.idProd]);

    const ids = (await getStockTeoricoBases()).map((b) => b.idProd);
    expect(ids).toContain(activa.idProd);
    expect(ids).not.toContain(inactiva.idProd);
  });

  it("getStockTeoricoBases con varios cierres parte del último", async () => {
    const userId = await seedUser();
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const c1 = await crearCierre(userId, 5);
    const c2 = await crearCierre(userId, 2);
    await cierreBase(c1, semi.idProd, 100);
    await cierreBase(c2, semi.idProd, 40);
    // Entre los dos cierres: no debe sumar (ya está dentro del real del último cierre).
    await crearPartidaSemi(semi.idProd, 9, "ENTRE", "now() - interval '3 days'");
    // Después del último cierre: suma.
    await crearPartidaSemi(semi.idProd, 5, "DESPUES", "now() - interval '1 day'");

    const fila = (await getStockTeoricoBases()).find((b) => b.idProd === semi.idProd)!;
    expect(fila.stockTeorico).toBe(45); // 40 + 5
  });

  it("getStockTeoricoBases combina una base con cierre y otra sin cierre", async () => {
    const userId = await seedUser();
    const conCierre = await createProducto({ detalle: "Base A", unidMed: "kg", tipoProducto: "SEMI" });
    const sinCierre = await createProducto({ detalle: "Base B", unidMed: "kg", tipoProducto: "SEMI" });
    const c = await crearCierre(userId, 2);
    await cierreBase(c, conCierre.idProd, 10);
    await crearPartidaSemi(conCierre.idProd, 4, "A1", "now()");
    await crearPartidaSemi(sinCierre.idProd, 6, "B1", "now() - interval '10 days'");
    await crearPartidaSemi(sinCierre.idProd, 1, "B2", "now()");

    const bases = await getStockTeoricoBases();
    expect(bases.find((b) => b.idProd === conCierre.idProd)!.stockTeorico).toBe(14); // 10 + 4
    expect(bases.find((b) => b.idProd === sinCierre.idProd)!.stockTeorico).toBe(7); // 6 + 1
  });

  it("getStockTeoricoBases: la baja de un lote con consumo asignado descuenta solo lo que quedaba", async () => {
    const userId = await seedUser();
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 2 }], userAlta: userId });
    const receta = await query<{ id_receta: number; id_det_receta: number }>(
      `SELECT r.id_receta, rd.id_det_receta FROM malaga.recetas r
       JOIN malaga.recetas_detalles rd ON rd.id_receta = r.id_receta WHERE r.id_prod = $1`,
      [pt.idProd]
    );
    const c = await crearCierre(userId, 2);
    await cierreBase(c, semi.idProd, 50);

    // Lote de 10 kg anterior al cierre, del que una OP finalizada después del cierre consumió 4 kg.
    const lote = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_ingreso, ts_baja_manual, motivo_baja_manual, user_baja_manual)
       VALUES ($1, 10, CURRENT_DATE - 5, 'B-VIEJA', now() - interval '3 days', now(), 'vencido', $2) RETURNING id_partistock`,
      [semi.idProd, userId]
    );
    const op = await query<{ id_op: number }>(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado, ts_fin)
       VALUES ($1, $2, 4, CURRENT_DATE, 'finalizada', now() - interval '1 hour') RETURNING id_op`,
      [pt.idProd, receta.rows[0].id_receta]
    );
    await query(
      `INSERT INTO malaga.f_trazabilidad_op (id_op, id_receta, id_detalle_receta, id_subprod, cant_subprod, id_parti_subprod, id_prod_op)
       VALUES ($1, $2, $3, $4, 4, $5, $6)`,
      [op.rows[0].id_op, receta.rows[0].id_receta, receta.rows[0].id_det_receta, semi.idProd, lote.rows[0].id_partistock, pt.idProd]
    );

    const fila = (await getStockTeoricoBases()).find((b) => b.idProd === semi.idProd)!;
    expect(fila.stockTeorico).toBe(40); // 50 - 4 consumidos - 6 que quedaban del lote dado de baja
  });

  it("getStockTeoricoBases no suma una partida cuya OP terminó antes del cierre aunque se haya registrado después", async () => {
    const userId = await seedUser();
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const c = await crearCierre(userId, 2);
    await cierreBase(c, semi.idProd, 20);
    const op = await query<{ id_op: number }>(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado, ts_fin)
       VALUES ($1, 15, CURRENT_DATE - 3, 'finalizada', now() - interval '3 days') RETURNING id_op`,
      [semi.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_ingreso, id_op_origen)
       VALUES ($1, 15, CURRENT_DATE - 3, 'TARDIA', now(), $2)`,
      [semi.idProd, op.rows[0].id_op]
    );

    const fila = (await getStockTeoricoBases()).find((b) => b.idProd === semi.idProd)!;
    expect(fila.stockTeorico).toBe(20);
  });

  it("getStockTeoricoBases suma una partida cuya OP terminó después del cierre aunque su ts_ingreso sea anterior", async () => {
    const userId = await seedUser();
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const c = await crearCierre(userId, 2);
    await cierreBase(c, semi.idProd, 20);
    const op = await query<{ id_op: number }>(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado, ts_fin)
       VALUES ($1, 7, CURRENT_DATE - 1, 'finalizada', now() - interval '1 day') RETURNING id_op`,
      [semi.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_ingreso, id_op_origen)
       VALUES ($1, 7, CURRENT_DATE - 1, 'TEMPRANA', now() - interval '5 days', $2)`,
      [semi.idProd, op.rows[0].id_op]
    );

    const fila = (await getStockTeoricoBases()).find((b) => b.idProd === semi.idProd)!;
    expect(fila.stockTeorico).toBe(27);
  });

  it("getDatosCierre: sabor sin receta, receta inactiva e ítem que no es SEMI quedan sin ítems", async () => {
    const userId = await seedUser();
    const sinReceta = await createProducto({ detalle: "A Sin receta", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const inactiva = await createProducto({ detalle: "B Inactiva", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const mixta = await createProducto({ detalle: "C Mixta", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const otroPt = await createProducto({ detalle: "Otro PT", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createReceta({ idProd: inactiva.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 2 }], userAlta: userId });
    await query(`UPDATE malaga.recetas SET activa = false WHERE id_prod = $1`, [inactiva.idProd]);
    await createReceta({
      idProd: mixta.idProd,
      items: [
        { idSubprod: semi.idProd, cantSubprod: 3 },
        { idSubprod: otroPt.idProd, cantSubprod: 1 },
      ],
      userAlta: userId,
    });
    for (const [nro, p] of [[1, sinReceta], [2, inactiva], [3, mixta]] as const) {
      await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES ($1, $2)`, [nro, p.idProd]);
    }

    const datos = await getDatosCierre();
    const porId = new Map(datos.sabores.map((x) => [x.idProd, x]));
    expect(datos.sabores).toHaveLength(3);
    expect(porId.get(sinReceta.idProd)!.items).toEqual([]);
    expect(porId.get(inactiva.idProd)!.items).toEqual([]);
    expect(porId.get(mixta.idProd)!.items).toEqual([{ idSubprod: semi.idProd, cantSubprod: 3 }]);
  }, 30000); // muchas escrituras seguidas contra la base remota

  it("getDatosCierre informa las cocciones pendientes de una base", async () => {
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado) VALUES ($1, 25, CURRENT_DATE, 'planificada')`,
      [semi.idProd]
    );

    const datos = await getDatosCierre();
    const base = datos.bases.find((b) => b.idProd === semi.idProd)!;
    expect(base.coccionesPendientes).toBe(25);
  });

  it("getDatosCierre incluye en bachasObrador las bachas de un sabor fuera de cartilla", async () => {
    const fuera = await createProducto({ detalle: "Fuera de cartilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const idPartida = await crearPartidaPt(fuera.idProd, 4, "L1");

    const datos = await getDatosCierre();
    expect(datos.sabores).toEqual([]);
    expect(datos.bachasObrador.map((b) => b.idPartida)).toEqual([idPartida]);
  });
});

// Cada escenario crea varias filas seguidas contra la base remota: supera los 5 s por defecto de vitest.
const TIMEOUT_ESCENARIO = 30000;

async function escenarioBasico() {
  const userId = await seedUser();
  const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
  const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
  await query(`UPDATE malaga.d_productos SET lote_optimo = 10, lote_minimo = 20 WHERE id_prod = $1`, [semi.idProd]);
  await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 2 }], userAlta: userId });
  const exhib = await query<{ id_exhibidora: number }>(
    `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
    [pt.idProd]
  );
  await setDemandaBase(pt.idProd, 10);
  const exhibida = await crearPartidaPt(pt.idProd, 4, "EXH");
  await exhibir(exhibida, exhib.rows[0].id_exhibidora, userId);
  const obrador = await crearPartidaPt(pt.idProd, 4, "OBR");
  return { userId, pt, semi, exhibida, obrador };
}

function entradaCierre(
  e: Awaited<ReturnType<typeof escenarioBasico>>,
  parcial: Partial<ConfirmarCierreInput> = {}
): ConfirmarCierreInput {
  return {
    fecha: "2030-01-01",
    fechaPlan: "2030-01-02",
    userCierre: e.userId,
    pctBachas: [{ idPartida: e.exhibida, pct: 50 }],
    stockReal: { [e.semi.idProd]: 3 },
    bachasOverride: {},
    cocinarOverride: {},
    ...parcial,
  };
}

// Entrada sin depender de un escenario: para validaciones de forma y casos con sus propios datos.
function entradaMinima(userId: number, parcial: Partial<ConfirmarCierreInput> = {}): ConfirmarCierreInput {
  return {
    fecha: "2030-01-01",
    fechaPlan: "2030-01-02",
    userCierre: userId,
    pctBachas: [],
    stockReal: {},
    bachasOverride: {},
    cocinarOverride: {},
    ...parcial,
  };
}

// Después de un cierre fallido no debe quedar nada en las tablas del cierre ni en las OPs.
async function expectSinCambios() {
  const tablas = [
    "f_cierre_dia",
    "f_cierre_dia_bacha",
    "f_cierre_dia_sabor",
    "f_cierre_dia_base",
    "f_pcp_pronostico",
    "f_ordenes_produccion",
  ];
  for (const tabla of tablas) {
    const r = await query<{ c: string }>(`SELECT count(*) AS c FROM malaga.${tabla}`);
    expect(Number(r.rows[0].c), tabla).toBe(0);
  }
}

describe("cierre queries — confirmar cierre", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("crea las OPs de fabricación y de cocción y guarda el cierre completo", async () => {
    const e = await escenarioBasico();

    const r = await confirmarCierre(entradaCierre(e));

    // demanda 12; stock = 4 (obrador) + 2 (50% de 4) = 6; necesario 6 -> 2 bachas = 8 kg
    // base: necesidad 2*2 = 4; real 3 -> descongelar 3, faltante 1; consumo diario 2*10*1.2/4 = 6;
    // objetivo 18; a reponer 18 + 1 - 0 = 19 -> 2 lotes de 10 = 20
    expect(r.opsFabricacion).toHaveLength(1);
    expect(r.opsCoccion).toHaveLength(1);

    const opPt = await query<{ cant_plan: string; fecha_plan: string; estado: string }>(
      `SELECT cant_plan, fecha_plan::text, estado FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsFabricacion[0]]
    );
    expect(Number(opPt.rows[0].cant_plan)).toBe(8);
    expect(opPt.rows[0].fecha_plan).toBe("2030-01-02");
    expect(opPt.rows[0].estado).toBe("planificada");

    const opSemi = await query<{ cant_plan: string }>(
      `SELECT cant_plan FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsCoccion[0]]
    );
    expect(Number(opSemi.rows[0].cant_plan)).toBe(20);

    const cierre = await query<{ fecha_plan: string; margen_pct: string; dias_cobertura: string }>(
      `SELECT fecha_plan::text, margen_pct, dias_cobertura FROM malaga.f_cierre_dia WHERE id_cierre = $1`,
      [r.idCierre]
    );
    expect(cierre.rows[0].fecha_plan).toBe("2030-01-02");
    expect(Number(cierre.rows[0].margen_pct)).toBe(20);

    const bacha = await query<{ pct: number }>(
      `SELECT pct FROM malaga.f_cierre_dia_bacha WHERE id_cierre = $1 AND id_partistock = $2`,
      [r.idCierre, e.exhibida]
    );
    expect(bacha.rows[0].pct).toBe(50);

    const sabor = await query<{ bachas: number; kg_a_fabricar: string; id_op_fabricar: number }>(
      `SELECT bachas, kg_a_fabricar, id_op_fabricar FROM malaga.f_cierre_dia_sabor WHERE id_cierre = $1`,
      [r.idCierre]
    );
    expect(sabor.rows[0].bachas).toBe(2);
    expect(Number(sabor.rows[0].kg_a_fabricar)).toBe(8);
    expect(sabor.rows[0].id_op_fabricar).toBe(r.opsFabricacion[0]);

    const base = await query<{
      stock_teorico: string;
      stock_real: string;
      descongelar: string;
      faltante: string;
      cocinar: string;
      id_op_cocinar: number;
    }>(
      `SELECT stock_teorico, stock_real, descongelar, faltante, cocinar, id_op_cocinar
       FROM malaga.f_cierre_dia_base WHERE id_cierre = $1`,
      [r.idCierre]
    );
    expect(Number(base.rows[0].stock_teorico)).toBe(0);
    expect(Number(base.rows[0].stock_real)).toBe(3);
    expect(Number(base.rows[0].descongelar)).toBe(3);
    expect(Number(base.rows[0].faltante)).toBe(1);
    expect(Number(base.rows[0].cocinar)).toBe(20);
    expect(base.rows[0].id_op_cocinar).toBe(r.opsCoccion[0]);

    const snapshot = await query(`SELECT 1 FROM malaga.f_pcp_pronostico WHERE fecha_plan = '2030-01-02'`);
    expect(snapshot.rows).toHaveLength(2); // una fila por el sabor y otra por la base
  }, TIMEOUT_ESCENARIO);

  it("repetir el cierre el mismo día no duplica OPs y mantiene el descongelado", async () => {
    const e = await escenarioBasico();
    await confirmarCierre(entradaCierre(e));

    const segundo = await confirmarCierre(entradaCierre(e));

    expect(segundo.opsFabricacion).toHaveLength(0);
    expect(segundo.opsCoccion).toHaveLength(0);
    const base = await query<{ descongelar: string; faltante: string }>(
      `SELECT descongelar, faltante FROM malaga.f_cierre_dia_base WHERE id_cierre = $1`,
      [segundo.idCierre]
    );
    expect(Number(base.rows[0].descongelar)).toBe(3);
    expect(Number(base.rows[0].faltante)).toBe(1);
    const total = await query<{ c: string }>(`SELECT count(*) AS c FROM malaga.f_ordenes_produccion`);
    expect(Number(total.rows[0].c)).toBe(2);
  }, TIMEOUT_ESCENARIO);

  it("usa las bachas y la cocción editadas a mano", async () => {
    const e = await escenarioBasico();

    const r = await confirmarCierre(
      entradaCierre(e, { bachasOverride: { [e.pt.idProd]: 1 }, cocinarOverride: { [e.semi.idProd]: 30 } })
    );

    const opPt = await query<{ cant_plan: string }>(
      `SELECT cant_plan FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsFabricacion[0]]
    );
    expect(Number(opPt.rows[0].cant_plan)).toBe(4);
    const opSemi = await query<{ cant_plan: string }>(
      `SELECT cant_plan FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsCoccion[0]]
    );
    expect(Number(opSemi.rows[0].cant_plan)).toBe(30);
  }, TIMEOUT_ESCENARIO);

  it("rechaza el cierre si falta el % de una bacha exhibida", async () => {
    const e = await escenarioBasico();
    await expect(confirmarCierre(entradaCierre(e, { pctBachas: [] }))).rejects.toThrow(
      "Falta indicar el % de todas las bachas exhibidas."
    );
  }, TIMEOUT_ESCENARIO);

  it("rechaza el cierre si falta el stock real de una base", async () => {
    const e = await escenarioBasico();
    await expect(confirmarCierre(entradaCierre(e, { stockReal: {} }))).rejects.toThrow(
      "Falta cargar el stock real de todas las bases."
    );
  }, TIMEOUT_ESCENARIO);

  it("rechaza porcentajes fuera de 0, 25, 50, 75 y 100", async () => {
    const e = await escenarioBasico();
    await expect(
      confirmarCierre(entradaCierre(e, { pctBachas: [{ idPartida: e.exhibida, pct: 30 }] }))
    ).rejects.toThrow("El % de cada bacha debe ser 0, 25, 50, 75 o 100.");
  }, TIMEOUT_ESCENARIO);

  it("rechaza sin dejar cambios cuando la validación falla", async () => {
    const e = await escenarioBasico();
    await expect(confirmarCierre(entradaCierre(e, { pctBachas: [] }))).rejects.toThrow();
    await expectSinCambios();
  }, TIMEOUT_ESCENARIO);

  it("hace rollback de todo si falla DENTRO de la transacción (después de insertar el cierre y sus bachas)", async () => {
    const e = await escenarioBasico();
    // Una demanda enorme pasa todas las validaciones y desborda el NUMERIC(12,3) de la OP de fabricación:
    // el error ocurre dentro de la transacción, después de insertar f_cierre_dia y f_cierre_dia_bacha.
    await setDemandaBase(e.pt.idProd, 900000000);

    await expect(confirmarCierre(entradaCierre(e))).rejects.toThrow(
      /overflow|out of range/i
    );

    await expectSinCambios();
  }, TIMEOUT_ESCENARIO);

  it("dos cierres simultáneos no duplican las OPs", async () => {
    const e = await escenarioBasico();

    const resultados = await Promise.allSettled([confirmarCierre(entradaCierre(e)), confirmarCierre(entradaCierre(e))]);

    expect(resultados.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const ops = await query<{ c: string }>(`SELECT count(*) AS c FROM malaga.f_ordenes_produccion`);
    expect(Number(ops.rows[0].c)).toBe(2); // 1 de fabricación y 1 de cocción
    const cierres = await query<{ c: string }>(`SELECT count(*) AS c FROM malaga.f_cierre_dia`);
    expect(Number(cierres.rows[0].c)).toBe(2);
    const bases = await query<{ descongelar: string; faltante: string }>(
      `SELECT descongelar, faltante FROM malaga.f_cierre_dia_base`
    );
    expect(bases.rows).toHaveLength(2);
    for (const b of bases.rows) {
      expect(Number(b.descongelar)).toBe(3);
      expect(Number(b.faltante)).toBe(1);
    }
  }, TIMEOUT_ESCENARIO);

  it("un sabor sin peso estándar queda fuera del plan: sin OP, pero con su fila en el cierre", async () => {
    // peso_estandar_obligatorio_pt impide un PT sin peso; el caso alcanzable es un producto no PT
    // (SEMI, sin peso) cargado en la exhibidora.
    const userId = await seedUser();
    const sinPeso = await createProducto({ detalle: "Sin peso", unidMed: "kg", tipoProducto: "SEMI" });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [sinPeso.idProd]);
    await setDemandaBase(sinPeso.idProd, 10);

    const r = await confirmarCierre(entradaMinima(userId, { stockReal: { [sinPeso.idProd]: 0 } }));

    expect(r.opsFabricacion).toEqual([]);
    const sabor = await query<{
      demanda: string;
      bachas: number;
      kg_a_fabricar: string;
      id_op_fabricar: number | null;
    }>(`SELECT demanda, bachas, kg_a_fabricar, id_op_fabricar FROM malaga.f_cierre_dia_sabor WHERE id_cierre = $1`, [
      r.idCierre,
    ]);
    expect(sabor.rows).toHaveLength(1);
    expect(Number(sabor.rows[0].demanda)).toBe(12);
    expect(sabor.rows[0].bachas).toBe(0);
    expect(Number(sabor.rows[0].kg_a_fabricar)).toBe(0);
    expect(sabor.rows[0].id_op_fabricar).toBeNull();
  }, TIMEOUT_ESCENARIO);

  it("una base con 0 kg a cocinar no crea OP", async () => {
    const e = await escenarioBasico();

    const r = await confirmarCierre(entradaCierre(e, { cocinarOverride: { [e.semi.idProd]: 0 } }));

    expect(r.opsFabricacion).toHaveLength(1);
    expect(r.opsCoccion).toEqual([]);
    const base = await query<{ cocinar: string; id_op_cocinar: number | null }>(
      `SELECT cocinar, id_op_cocinar FROM malaga.f_cierre_dia_base WHERE id_cierre = $1`,
      [r.idCierre]
    );
    expect(Number(base.rows[0].cocinar)).toBe(0);
    expect(base.rows[0].id_op_cocinar).toBeNull();
  }, TIMEOUT_ESCENARIO);
});

// Validaciones de forma: se rechazan antes de tocar la base, así que no necesitan escenario.
describe("cierre queries — validación de la entrada", () => {
  const MSG_STOCK = "El stock real de cada base debe ser un número mayor o igual a 0.";
  const MSG_BACHAS = "Las bachas deben ser un número entero mayor o igual a 0.";
  const MSG_COCINAR = "Los kg a cocinar deben ser un número mayor o igual a 0.";

  it.each([
    ["el stock real es negativo", { stockReal: { 1: -1 } }, MSG_STOCK],
    ["el stock real no es un número", { stockReal: { 1: Number.NaN } }, MSG_STOCK],
    ["el stock real es absurdamente grande", { stockReal: { 1: 1e9 } }, MSG_STOCK],
    ["las bachas editadas no son enteras", { bachasOverride: { 1: 1.5 } }, MSG_BACHAS],
    ["las bachas editadas son negativas", { bachasOverride: { 1: -1 } }, MSG_BACHAS],
    ["los kg a cocinar son negativos", { cocinarOverride: { 1: -5 } }, MSG_COCINAR],
    ["la fecha del plan no existe", { fechaPlan: "2030-02-30" }, "La fecha del plan no es válida."],
    ["la fecha del plan no tiene el formato esperado", { fechaPlan: "02/03/2030" }, "La fecha del plan no es válida."],
    ["la fecha del cierre no existe", { fecha: "2030-13-01" }, "La fecha del cierre no es válida."],
  ] as [string, Partial<ConfirmarCierreInput>, string][])("rechaza si %s", async (_nombre, parcial, mensaje) => {
    await expect(confirmarCierre(entradaMinima(1, parcial))).rejects.toThrow(mensaje);
  });

  it("rechaza si pctBachas no es una lista", async () => {
    const mensaje = "Los datos del cierre no son válidos.";
    await expect(confirmarCierre(entradaMinima(1, { pctBachas: null as unknown as [] }))).rejects.toThrow(mensaje);
  });
});

describe("cierre queries — plan del día", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("sin cierre devuelve listas vacías", async () => {
    const plan = await getPlanDelDia("2030-01-02");
    expect(plan.cierre).toBeNull();
    expect(plan.fabricar).toEqual([]);
    expect(plan.cocinar).toEqual([]);
    expect(plan.descongelar).toEqual([]);
  });

  it("arma fabricar, cocinar y descongelar con las OPs de hoy y el último cierre", async () => {
    const e = await escenarioBasico();
    await confirmarCierre(entradaCierre(e));

    const plan = await getPlanDelDia("2030-01-02");

    expect(plan.cierre).not.toBeNull();
    expect(plan.cierre!.userCierre).toBe("cierre@t.com");
    expect(plan.fabricar).toHaveLength(1);
    expect(plan.fabricar[0]).toMatchObject({ productoDetalle: "Vainilla", cantPlan: 8 });
    expect(plan.cocinar).toHaveLength(1);
    expect(plan.cocinar[0]).toMatchObject({ productoDetalle: "Base Media", cantPlan: 20 });
    expect(plan.descongelar).toEqual([{ idProd: e.semi.idProd, detalle: "Base Media", descongelar: 3, faltante: 1 }]);
  }, TIMEOUT_ESCENARIO);

  it("no incluye OPs canceladas ni de otras fechas", async () => {
    const e = await escenarioBasico();
    const r = await confirmarCierre(entradaCierre(e));
    const otraFecha = await query<{ id_op: number }>(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado)
       VALUES ($1, 12, '2030-01-03', 'planificada') RETURNING id_op`,
      [e.pt.idProd]
    );

    // Antes de cancelar: el plan de hoy tiene la OP de fabricación del cierre y no la de otra fecha.
    const antes = await getPlanDelDia("2030-01-02");
    expect(antes.fabricar.map((o) => o.idOp)).toEqual([r.opsFabricacion[0]]);

    // Cancelo tanto la OP de cocción (SEMI) como la de fabricación (PT).
    await query(`UPDATE malaga.f_ordenes_produccion SET estado = 'cancelada' WHERE id_op = ANY($1::int[])`, [
      [r.opsCoccion[0], r.opsFabricacion[0]],
    ]);

    const plan = await getPlanDelDia("2030-01-02");
    expect(plan.cocinar).toEqual([]);
    expect(plan.fabricar).toEqual([]);

    const otroDia = await getPlanDelDia("2030-01-03");
    expect(otroDia.fabricar).toHaveLength(1);
    expect(otroDia.fabricar[0]).toMatchObject({ idOp: otraFecha.rows[0].id_op, cantPlan: 12 });
    expect(otroDia.cocinar).toEqual([]);
    expect(otroDia.cierre).toBeNull();
  }, TIMEOUT_ESCENARIO);

  it("si se repitió el cierre, el descongelado sale del último cierre", async () => {
    const e = await escenarioBasico();
    const primero = await confirmarCierre(entradaCierre(e));
    // Necesidad de la base = 4. Con stock real 3: descongelar 3, faltante 1.
    // Con stock real 1: descongelar 1, faltante 3.
    const segundo = await confirmarCierre(entradaCierre(e, { stockReal: { [e.semi.idProd]: 1 } }));
    expect(segundo.idCierre).toBeGreaterThan(primero.idCierre);

    const plan = await getPlanDelDia("2030-01-02");
    expect(plan.cierre!.idCierre).toBe(segundo.idCierre);
    expect(plan.descongelar).toEqual([{ idProd: e.semi.idProd, detalle: "Base Media", descongelar: 1, faltante: 3 }]);
    expect(plan.fabricar).toHaveLength(1);
  }, TIMEOUT_ESCENARIO);
});

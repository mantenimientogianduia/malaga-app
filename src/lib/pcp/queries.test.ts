import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import {
  getExhibicionesPorSemana,
  getDistribucionPorDia,
  getDistribucionPorProducto,
  getFactoresDia,
  setFactorDia,
  listFactoresProducto,
  setFactorProducto,
  getConfigTodosLosProductos,
  getStockActualPorProducto,
  getCoccionesPendientesPorProducto,
  getProductosEnCartilla,
  getItemsRecetaSemiPorProducto,
  calcularPlanManana,
  generarPlanManana,
} from "./queries";
import { createReceta } from "../recetas/queries";
import { listOrdenes } from "../ordenes/queries";

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

  // Lunes (ISO dow 1) de la semana que empezó `semanasAtras` semanas antes de la semana
  // actual (calculada en UTC, igual que date_trunc('week', ...) en Postgres). Se usa para
  // generar fechas de fixture que siempre caen dentro de la ventana móvil de 8 semanas que
  // usan getDistribucionPorDia/getDistribucionPorProducto, sin importar cuándo corra el test.
  function lunesHaceSemanas(semanasAtras: number): Date {
    const ahora = new Date();
    const diaIso = ((ahora.getUTCDay() + 6) % 7) + 1; // 1=lunes..7=domingo
    const lunesActual = new Date(
      Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - (diaIso - 1))
    );
    lunesActual.setUTCDate(lunesActual.getUTCDate() - semanasAtras * 7);
    return lunesActual;
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
    // Lunes y martes de una semana completa, holgadamente dentro de la ventana de 8
    // semanas y lejos del límite de la semana actual (2 semanas atrás).
    const lunes = lunesHaceSemanas(2);
    const martes = new Date(lunes);
    martes.setUTCDate(martes.getUTCDate() + 1);
    await exhibir(p.idProd, new Date(lunes.getTime() + 10 * 3600 * 1000).toISOString(), 30);
    await exhibir(p.idProd, new Date(martes.getTime() + 10 * 3600 * 1000).toISOString(), 70);

    const distribucion = await getDistribucionPorDia(8);
    expect(distribucion[1]).toBeCloseTo(0.3, 5);
    expect(distribucion[2]).toBeCloseTo(0.7, 5);
  });

  it("getDistribucionPorProducto solo considera productos actualmente en cartilla", async () => {
    const enCartilla = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const fueraDeCartilla = await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [enCartilla.idProd]);

    // Holgadamente dentro de la ventana de 8 semanas y lejos del límite de la semana actual.
    const fecha = new Date(lunesHaceSemanas(2).getTime() + 10 * 3600 * 1000).toISOString();
    await exhibir(enCartilla.idProd, fecha, 40);
    await exhibir(fueraDeCartilla.idProd, fecha, 60);

    const distribucion = await getDistribucionPorProducto(8);
    expect(distribucion[enCartilla.idProd]).toBeCloseTo(1, 5);
    expect(distribucion[fueraDeCartilla.idProd]).toBeUndefined();
  });
});

describe("pcp queries — factores", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos, malaga.pcp_factor_producto RESTART IDENTITY CASCADE"
    );
    await query("UPDATE malaga.pcp_factor_dia_semana SET factor = 1.0");
  });

  it("getFactoresDia devuelve los 7 días con factor 1.0 por defecto", async () => {
    const factores = await getFactoresDia();
    expect(factores).toHaveLength(7);
    expect(factores.every((f) => f.factor === 1)).toBe(true);
  });

  it("setFactorDia actualiza el factor de un día puntual", async () => {
    await setFactorDia(6, 1.15);
    const factores = await getFactoresDia();
    const sabado = factores.find((f) => f.diaSemana === 6)!;
    expect(sabado.factor).toBeCloseTo(1.15, 5);
  });

  it("listFactoresProducto devuelve factor 1.0 para productos sin fila propia", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const factores = await listFactoresProducto();
    const fila = factores.find((f) => f.idProd === p.idProd)!;
    expect(fila.factor).toBe(1);
  });

  it("setFactorProducto crea o actualiza la fila de ese producto", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await setFactorProducto(p.idProd, 0.85);
    let factores = await listFactoresProducto();
    expect(factores.find((f) => f.idProd === p.idProd)!.factor).toBeCloseTo(0.85, 5);

    await setFactorProducto(p.idProd, 1.2);
    factores = await listFactoresProducto();
    expect(factores.find((f) => f.idProd === p.idProd)!.factor).toBeCloseTo(1.2, 5);
  });
});

describe("pcp queries — config, stock y pendientes por lote", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_exhibidora, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("getConfigTodosLosProductos trae stock_minimo/lote_optimo/lote_minimo de cada producto", async () => {
    const p = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(
      `UPDATE malaga.d_productos SET stock_minimo = 5, lote_optimo = 10, lote_minimo = 60 WHERE id_prod = $1`,
      [p.idProd]
    );

    const config = await getConfigTodosLosProductos();
    const c = config.get(p.idProd)!;
    expect(c.stockMinimo).toBe(5);
    expect(c.loteOptimo).toBe(10);
    expect(c.loteMinimo).toBe(60);
  });

  it("getStockActualPorProducto suma vivo de PT y de SEMI (restante)", async () => {
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [pt.idProd]
    );
    const userExhibicion = await seedUser();
    const partidaPt = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [pt.idProd]
    );
    await query(
      `UPDATE malaga.f_partidas_stock SET ts_exhibicion = now(), id_exhibidora = $2, user_exhibicion = $3 WHERE id_partistock = $1`,
      [partidaPt.rows[0].id_partistock, exhib.rows[0].id_exhibidora, userExhibicion]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 7, '2026-08-01', 'L2')`,
      [semi.idProd]
    );

    const stock = await getStockActualPorProducto();
    expect(stock.get(pt.idProd)).toBe(4);
    expect(stock.get(semi.idProd)).toBe(7);
  });

  it("getCoccionesPendientesPorProducto suma cant_plan de OPs planificada/en_proceso, no de las finalizadas", async () => {
    const p = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado) VALUES ($1, 20, '2026-08-06', 'planificada')`,
      [p.idProd]
    );
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado, ts_ini) VALUES ($1, 15, '2026-08-06', 'en_proceso', now())`,
      [p.idProd]
    );
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado) VALUES ($1, 999, '2026-08-01', 'finalizada')`,
      [p.idProd]
    );

    const pendientes = await getCoccionesPendientesPorProducto();
    expect(pendientes.get(p.idProd)).toBe(35);
  });

  it("getProductosEnCartilla devuelve los PT actuales y los programados a futuro", async () => {
    const actual = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const futuro = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01')`,
      [actual.idProd, futuro.idProd]
    );

    const productos = await getProductosEnCartilla();
    expect(productos.map((p) => p.idProd).sort()).toEqual([actual.idProd, futuro.idProd].sort());
  });

  it("getItemsRecetaSemiPorProducto trae solo ingredientes SEMI de la receta activa", async () => {
    const userAlta = await seedUser();
    const pt = await createProducto({ detalle: "Gianduia", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const otroPt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }, { idSubprod: otroPt.idProd, cantSubprod: 0.1 }], userAlta });

    const items = await getItemsRecetaSemiPorProducto([pt.idProd]);
    const itemsDePt = items.get(pt.idProd) ?? [];
    expect(itemsDePt).toHaveLength(1);
    expect(itemsDePt[0].idSubprod).toBe(semi.idProd);
    expect(Number(itemsDePt[0].cantSubprod)).toBeCloseTo(0.5, 5);
  });

  it("getItemsRecetaSemiPorProducto con lista vacía no falla", async () => {
    const items = await getItemsRecetaSemiPorProducto([]);
    expect(items.size).toBe(0);
  });
});

describe("calcularPlanManana", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_exhibidora, malaga.d_productos, malaga.pcp_factor_producto, malaga.usuarios RESTART IDENTITY CASCADE"
    );
    await query("UPDATE malaga.pcp_factor_dia_semana SET factor = 1.0");
  });

  it("sin historial de exhibiciones ni stock mínimo, no sugiere nada", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [p.idProd]);

    const filas = await calcularPlanManana();
    const fila = filas.find((f) => f.idProd === p.idProd)!;
    expect(fila.demandaPronosticada).toBe(0);
    expect(fila.cantidadAPlanificar).toBe(0);
  });

  it("con stock mínimo pero sin stock actual, sugiere producir aunque no haya pronóstico", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [p.idProd]);
    await query(`UPDATE malaga.d_productos SET stock_minimo = 4, lote_optimo = 4 WHERE id_prod = $1`, [p.idProd]);

    const filas = await calcularPlanManana();
    const fila = filas.find((f) => f.idProd === p.idProd)!;
    expect(fila.necesario).toBeCloseTo(4, 5);
    expect(fila.cantidadAPlanificar).toBe(4);
  });

  it("explota la receta activa y suma la demanda de la base entre todos los sabores que la usan", async () => {
    const userAlta = (
      await query<{ id_user: number }>(
        `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com','x','admin') RETURNING id_user`
      )
    ).rows[0].id_user;

    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const pt1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const pt2 = await createProducto({ detalle: "Gianduia", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1), (2, $2)`, [pt1.idProd, pt2.idProd]);
    await query(`UPDATE malaga.d_productos SET stock_minimo = 4, lote_optimo = 4 WHERE id_prod IN ($1, $2)`, [
      pt1.idProd,
      pt2.idProd,
    ]);

    const { createReceta } = await import("../recetas/queries");
    await createReceta({ idProd: pt1.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }], userAlta });
    await createReceta({ idProd: pt2.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }], userAlta });

    const filas = await calcularPlanManana();
    const filaSemi = filas.find((f) => f.idProd === semi.idProd)!;
    // Cada PT necesita 4kg (su stock mínimo, sin stock actual) -> 0.5 * 4 + 0.5 * 4 = 4kg de base.
    expect(filaSemi.demandaPronosticada).toBeCloseTo(4, 5);
    expect(filaSemi.tipoProducto).toBe("SEMI");
  });

  it("un sabor con cantidad_a_planificar 0 no le pide nada a sus bases", async () => {
    const userAlta = (
      await query<{ id_user: number }>(
        `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com','x','admin') RETURNING id_user`
      )
    ).rows[0].id_user;

    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [pt.idProd]);
    // Sin stock mínimo ni historial: cantidad_a_planificar = 0.

    const { createReceta } = await import("../recetas/queries");
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }], userAlta });

    const filas = await calcularPlanManana();
    expect(filas.find((f) => f.idProd === semi.idProd)).toBeUndefined();
  });
});

describe("generarPlanManana", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_pcp_pronostico, malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("crea una OP por cada fila con cantidad > 0 y ninguna para las de cantidad 0", async () => {
    const userGenerado = await seedUser();
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });

    const { idsOp } = await generarPlanManana(
      [
        {
          idProd: p1.idProd,
          tipoProducto: "PT",
          cantidadAPlanificar: 8,
          demandaPronosticada: 7.5,
          stockActual: 0,
          stockMinimo: 4,
          coccionesPendientes: 0,
          necesario: 7.5,
        },
        {
          idProd: p2.idProd,
          tipoProducto: "PT",
          cantidadAPlanificar: 0,
          demandaPronosticada: 0,
          stockActual: 10,
          stockMinimo: 4,
          coccionesPendientes: 0,
          necesario: -6,
        },
      ],
      "2026-08-06",
      null,
      userGenerado
    );

    expect(idsOp).toHaveLength(1);
    const ordenes = await listOrdenes();
    expect(ordenes.find((o) => o.idProd === p1.idProd)?.cantPlan).toBe("8.000");
    expect(ordenes.find((o) => o.idProd === p2.idProd)).toBeUndefined();
  });

  it("guarda un snapshot en f_pcp_pronostico por cada fila, con o sin OP generada", async () => {
    const userGenerado = await seedUser();
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });

    await generarPlanManana(
      [
        {
          idProd: p.idProd,
          tipoProducto: "PT",
          cantidadAPlanificar: 0,
          demandaPronosticada: 1,
          stockActual: 10,
          stockMinimo: 4,
          coccionesPendientes: 0,
          necesario: -5,
        },
      ],
      "2026-08-06",
      1.2,
      userGenerado
    );

    const snapshot = await query<{ id_op_generada: number | null; factor_puntual_semana: string | null }>(
      `SELECT id_op_generada, factor_puntual_semana FROM malaga.f_pcp_pronostico WHERE id_prod = $1`,
      [p.idProd]
    );
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].id_op_generada).toBeNull();
    expect(Number(snapshot.rows[0].factor_puntual_semana)).toBeCloseTo(1.2, 5);
  });
});

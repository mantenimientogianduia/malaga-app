import type { PoolClient } from "pg";
import { query, withTransaction } from "../db";
import {
  getCoccionesPendientesPorProducto,
  getItemsRecetaSemiPorProducto,
} from "./queries";
import { calcularCierre, type SaborCierre, type StockSabor } from "./cierre-calc";

export interface ConfigPcp {
  margenPct: number;
  diasCobertura: number;
}

export async function getConfigPcp(): Promise<ConfigPcp> {
  const result = await query<{ margen_pct: string; dias_cobertura: string }>(
    `SELECT margen_pct, dias_cobertura FROM malaga.pcp_config WHERE id = 1`
  );
  const row = result.rows[0];
  return { margenPct: Number(row.margen_pct), diasCobertura: Number(row.dias_cobertura) };
}

export async function updateConfigPcp(margenPct: number, diasCobertura: number): Promise<void> {
  await query(`UPDATE malaga.pcp_config SET margen_pct = $1, dias_cobertura = $2 WHERE id = 1`, [
    margenPct,
    diasCobertura,
  ]);
}

export interface DemandaBaseFila {
  idProd: number;
  detalle: string;
  pesoEstandar: number | null;
  kgDia: number;
}

// Sabores en cartilla o programados a entrar, con sus kg/día (0 si todavía no se cargó).
export async function listDemandaBase(): Promise<DemandaBaseFila[]> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    peso_estandar: string | null;
    kg_dia: string;
  }>(
    `SELECT p.id_prod, p.detalle, p.peso_estandar, COALESCE(d.kg_dia, 0) AS kg_dia
     FROM malaga.d_productos p
     LEFT JOIN malaga.pcp_demanda_base d ON d.id_prod = p.id_prod
     WHERE p.id_prod IN (
       SELECT id_prod FROM malaga.d_exhibidora
       UNION
       SELECT id_prod_fut FROM malaga.d_exhibidora WHERE id_prod_fut IS NOT NULL
     )
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    pesoEstandar: r.peso_estandar === null ? null : Number(r.peso_estandar),
    kgDia: Number(r.kg_dia),
  }));
}

export async function setDemandaBase(idProd: number, kgDia: number): Promise<void> {
  await query(
    `INSERT INTO malaga.pcp_demanda_base (id_prod, kg_dia) VALUES ($1, $2)
     ON CONFLICT (id_prod) DO UPDATE SET kg_dia = EXCLUDED.kg_dia`,
    [idProd, kgDia]
  );
}

export interface BachaObrador {
  idPartida: number;
  idProd: number;
  detalle: string;
  lote: string;
  cantidad: number;
}

// Bachas de PT terminadas que todavía no salieron a la exhibidora (y no tienen baja).
export async function listBachasObrador(): Promise<BachaObrador[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    detalle: string;
    lote: string;
    cantidad: string;
  }>(
    `SELECT ps.id_partistock, ps.id_prod, p.detalle, ps.lote, ps.cantidad
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL AND ps.ts_baja_manual IS NULL
     ORDER BY p.detalle, ps.fecha_fab, ps.id_partistock`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    detalle: r.detalle,
    lote: r.lote,
    cantidad: Number(r.cantidad),
  }));
}

export interface BachaExhibida {
  idPartida: number;
  idProd: number;
  detalle: string;
  lote: string;
  cantidad: number;
  nroPosicion: number;
}

// La bacha actualmente exhibida en cada posición (la última partida exhibida del slot).
// Equivale a v_stock_pt_vivo pero sin la subconsulta correlacionada de la vista, que es cuadrática
// en la cantidad de partidas. El filtro PT se aplica después de elegir la última partida del slot,
// igual que la vista (si la última exhibida no es PT, el slot no se informa).
export async function listBachasExhibidas(): Promise<BachaExhibida[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    detalle: string;
    lote: string;
    cantidad: string;
    nro: number;
  }>(
    `SELECT t.id_partistock, t.id_prod, t.detalle, t.lote, t.cantidad, t.nro
     FROM (
       SELECT DISTINCT ON (ps.id_exhibidora)
         ps.id_partistock, ps.id_prod, p.detalle, p.tipo_producto, ps.lote, ps.cantidad, e.nro
       FROM malaga.f_partidas_stock ps
       JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
       JOIN malaga.d_exhibidora e ON e.id_exhibidora = ps.id_exhibidora
       WHERE ps.ts_exhibicion IS NOT NULL
       ORDER BY ps.id_exhibidora, ps.ts_exhibicion DESC, ps.id_partistock DESC
     ) t
     WHERE t.tipo_producto = 'PT'
     ORDER BY t.nro`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    detalle: r.detalle,
    lote: r.lote,
    cantidad: Number(r.cantidad),
    nroPosicion: r.nro,
  }));
}

export interface BaseTeorica {
  idProd: number;
  detalle: string;
  loteOptimo: number | null;
  loteMinimo: number | null;
  stockTeorico: number;
}

// Stock teórico de cada base activa (SEMI).
// Con cierre previo: real del último cierre + producido - consumido - bajas desde entonces.
// Sin cierre previo: suma del restante por lotes (v_stock_semi_vivo). Esa vista descuenta el consumo
// solo por lote, así que en el primer cierre los consumos sin lote elegido no se restan y el teórico
// puede salir inflado; se corrige solo con el primer stock real.
// El producido se mide con el momento en que terminó la OP de cocción (ts_fin) y, si la partida no
// tiene OP, con ts_ingreso. El desfase del reloj del dispositivo del usuario queda fuera de alcance.
// El consumo se toma de f_trazabilidad_op por base (id_subprod) y no por lote, porque
// una OP puede finalizarse sin haber elegido el lote consumido.
export async function getStockTeoricoBases(): Promise<BaseTeorica[]> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    lote_optimo: string | null;
    lote_minimo: string | null;
    teorico: string;
  }>(
    `WITH ultimo AS (
       SELECT DISTINCT ON (b.id_prod) b.id_prod, b.stock_real, c.ts_cierre
       FROM malaga.f_cierre_dia_base b
       JOIN malaga.f_cierre_dia c ON c.id_cierre = b.id_cierre
       ORDER BY b.id_prod, c.ts_cierre DESC, c.id_cierre DESC
     )
     SELECT p.id_prod, p.detalle, p.lote_optimo, p.lote_minimo,
       CASE WHEN u.id_prod IS NULL THEN
         COALESCE((SELECT SUM(v.restante) FROM malaga.v_stock_semi_vivo v WHERE v.id_prod = p.id_prod), 0)
       ELSE
         u.stock_real
         + COALESCE((
             SELECT SUM(ps.cantidad) FROM malaga.f_partidas_stock ps
             LEFT JOIN malaga.f_ordenes_produccion op ON op.id_op = ps.id_op_origen
             WHERE ps.id_prod = p.id_prod AND COALESCE(op.ts_fin, ps.ts_ingreso) > u.ts_cierre
           ), 0)
         - COALESCE((
             SELECT SUM(t.cant_subprod)
             FROM malaga.f_trazabilidad_op t
             JOIN malaga.f_ordenes_produccion o ON o.id_op = t.id_op
             WHERE t.id_subprod = p.id_prod AND o.ts_fin > u.ts_cierre
           ), 0)
         - COALESCE((
             SELECT SUM(ps.cantidad - COALESCE(cons.total, 0))
             FROM malaga.f_partidas_stock ps
             LEFT JOIN (
               SELECT id_parti_subprod, SUM(cant_subprod) AS total
               FROM malaga.f_trazabilidad_op
               WHERE id_parti_subprod IS NOT NULL
               GROUP BY id_parti_subprod
             ) cons ON cons.id_parti_subprod = ps.id_partistock
             WHERE ps.id_prod = p.id_prod AND ps.ts_baja_manual > u.ts_cierre
           ), 0)
       END AS teorico
     FROM malaga.d_productos p
     LEFT JOIN ultimo u ON u.id_prod = p.id_prod
     WHERE p.tipo_producto = 'SEMI' AND p.activo = true
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    loteOptimo: r.lote_optimo === null ? null : Number(r.lote_optimo),
    loteMinimo: r.lote_minimo === null ? null : Number(r.lote_minimo),
    stockTeorico: Number(r.teorico),
  }));
}

export interface BaseDatos extends BaseTeorica {
  coccionesPendientes: number;
}

export interface DatosCierre {
  margenPct: number;
  diasCobertura: number;
  sabores: SaborCierre[];
  bachasObrador: BachaObrador[];
  bachasExhibidas: BachaExhibida[];
  bases: BaseDatos[];
}

// Todo lo que necesita la pantalla de cierre. Es serializable (se pasa a un componente cliente).
export async function getDatosCierre(): Promise<DatosCierre> {
  const [config, demanda, pendientes, bachasObrador, bachasExhibidas, bases] = await Promise.all([
    getConfigPcp(),
    listDemandaBase(),
    getCoccionesPendientesPorProducto(),
    listBachasObrador(),
    listBachasExhibidas(),
    getStockTeoricoBases(),
  ]);
  const itemsPorSabor = await getItemsRecetaSemiPorProducto(demanda.map((d) => d.idProd));

  const sabores: SaborCierre[] = demanda.map((d) => ({
    idProd: d.idProd,
    detalle: d.detalle,
    pesoEstandar: d.pesoEstandar,
    demandaBaseKgDia: d.kgDia,
    coccionesPendientes: pendientes.get(d.idProd) ?? 0,
    items: (itemsPorSabor.get(d.idProd) ?? []).map((i) => ({
      idSubprod: i.idSubprod,
      cantSubprod: Number(i.cantSubprod),
    })),
  }));

  return {
    margenPct: config.margenPct,
    diasCobertura: config.diasCobertura,
    sabores,
    bachasObrador,
    bachasExhibidas,
    bases: bases.map((b) => ({ ...b, coccionesPendientes: pendientes.get(b.idProd) ?? 0 })),
  };
}

export interface ConfirmarCierreInput {
  fecha: string;
  fechaPlan: string;
  userCierre: number;
  // Bachas del obrador que el usuario destildó (no están físicamente).
  ausentes: number[];
  pctBachas: { idPartida: number; pct: number }[];
  stockReal: Record<number, number>;
  bachasOverride: Record<number, number>;
  cocinarOverride: Record<number, number>;
}

export interface ResultadoConfirmacion {
  idCierre: number;
  opsFabricacion: number[];
  opsCoccion: number[];
}

const PORCENTAJES_VALIDOS = [0, 25, 50, 75, 100];

async function crearOpPlanificada(
  client: PoolClient,
  idProd: number,
  cantidad: number,
  fechaPlan: string
): Promise<number> {
  // Misma lógica que createOrdenProduccion (src/lib/ordenes/queries.ts), pero con el client de
  // esta transacción. Una OP sin receta activa se crea igual (al finalizarla no hay ingredientes).
  const receta = await client.query<{ id_receta: number }>(
    `SELECT id_receta FROM malaga.recetas WHERE id_prod = $1 AND activa = true`,
    [idProd]
  );
  const op = await client.query<{ id_op: number }>(
    `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado)
     VALUES ($1, $2, $3, $4, 'planificada') RETURNING id_op`,
    [idProd, receta.rows[0]?.id_receta ?? null, cantidad, fechaPlan]
  );
  return op.rows[0].id_op;
}

export async function confirmarCierre(input: ConfirmarCierreInput): Promise<ResultadoConfirmacion> {
  const datos = await getDatosCierre();

  const pctPorPartida = new Map(input.pctBachas.map((p) => [p.idPartida, p.pct]));
  if (datos.bachasExhibidas.some((b) => !pctPorPartida.has(b.idPartida))) {
    throw new Error("Falta indicar el % de todas las bachas exhibidas.");
  }
  if (input.pctBachas.some((p) => !PORCENTAJES_VALIDOS.includes(p.pct))) {
    throw new Error("El % de cada bacha debe ser 0, 25, 50, 75 o 100.");
  }
  if (datos.bases.some((b) => input.stockReal[b.idProd] === undefined)) {
    throw new Error("Falta cargar el stock real de todas las bases.");
  }
  if (Object.values(input.stockReal).some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error("El stock real de cada base debe ser un número mayor o igual a 0.");
  }
  if (Object.values(input.bachasOverride).some((v) => !Number.isInteger(v) || v < 0)) {
    throw new Error("Las bachas deben ser un número entero mayor o igual a 0.");
  }
  if (Object.values(input.cocinarOverride).some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error("Los kg a cocinar deben ser un número mayor o igual a 0.");
  }

  const idsObrador = new Set(datos.bachasObrador.map((b) => b.idPartida));
  const ausentes = new Set(input.ausentes.filter((id) => idsObrador.has(id)));

  const stockSabores: Record<number, StockSabor> = {};
  const stockDe = (idProd: number): StockSabor =>
    (stockSabores[idProd] ??= { kgObrador: 0, kgExhibidaPonderada: 0 });
  for (const b of datos.bachasObrador) {
    if (!ausentes.has(b.idPartida)) stockDe(b.idProd).kgObrador += b.cantidad;
  }
  for (const b of datos.bachasExhibidas) {
    stockDe(b.idProd).kgExhibidaPonderada += (b.cantidad * (pctPorPartida.get(b.idPartida) as number)) / 100;
  }

  const resultado = calcularCierre({
    margenPct: datos.margenPct,
    diasCobertura: datos.diasCobertura,
    sabores: datos.sabores,
    stockSabores,
    bases: datos.bases.map((b) => ({
      idProd: b.idProd,
      detalle: b.detalle,
      stockReal: input.stockReal[b.idProd],
      coccionesPendientes: b.coccionesPendientes,
      loteOptimo: b.loteOptimo,
      loteMinimo: b.loteMinimo,
    })),
    bachasOverride: input.bachasOverride,
    cocinarOverride: input.cocinarOverride,
  });
  const teoricoPorBase = new Map(datos.bases.map((b) => [b.idProd, b.stockTeorico]));

  return withTransaction(async (client) => {
    if (ausentes.size > 0) {
      await client.query(
        `UPDATE malaga.f_partidas_stock
         SET ts_baja_manual = now(), motivo_baja_manual = 'ajuste', user_baja_manual = $2
         WHERE id_partistock = ANY($1::int[]) AND ts_exhibicion IS NULL AND ts_baja_manual IS NULL`,
        [Array.from(ausentes), input.userCierre]
      );
    }

    const cierre = await client.query<{ id_cierre: number }>(
      `INSERT INTO malaga.f_cierre_dia (fecha, fecha_plan, user_cierre, margen_pct, dias_cobertura)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_cierre`,
      [input.fecha, input.fechaPlan, input.userCierre, datos.margenPct, datos.diasCobertura]
    );
    const idCierre = cierre.rows[0].id_cierre;

    for (const b of datos.bachasExhibidas) {
      await client.query(
        `INSERT INTO malaga.f_cierre_dia_bacha (id_cierre, id_partistock, pct) VALUES ($1, $2, $3)`,
        [idCierre, b.idPartida, pctPorPartida.get(b.idPartida)]
      );
    }

    const opsFabricacion: number[] = [];
    for (const f of resultado.fabricacion) {
      const idOp = f.kgAFabricar > 0 ? await crearOpPlanificada(client, f.idProd, f.kgAFabricar, input.fechaPlan) : null;
      if (idOp !== null) opsFabricacion.push(idOp);

      await client.query(
        `INSERT INTO malaga.f_cierre_dia_sabor
           (id_cierre, id_prod, demanda, stock_disponible, cocciones_pendientes, necesario, bachas, kg_a_fabricar, id_op_fabricar)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [idCierre, f.idProd, f.demandaManana, f.stockDisponible, f.coccionesPendientes, f.necesario, f.bachas, f.kgAFabricar, idOp]
      );
      await client.query(
        `INSERT INTO malaga.f_pcp_pronostico
           (fecha_plan, id_prod, demanda_pronosticada, stock_actual_momento, stock_minimo_momento,
            cocciones_pendientes_momento, necesario, cantidad_planificada, id_op_generada, user_generado)
         VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)`,
        [input.fechaPlan, f.idProd, f.demandaManana, f.stockDisponible, f.coccionesPendientes, f.necesario, f.kgAFabricar, idOp, input.userCierre]
      );
    }

    const opsCoccion: number[] = [];
    for (const b of resultado.bases) {
      const idOp = b.kgACocinar > 0 ? await crearOpPlanificada(client, b.idProd, b.kgACocinar, input.fechaPlan) : null;
      if (idOp !== null) opsCoccion.push(idOp);

      await client.query(
        `INSERT INTO malaga.f_cierre_dia_base
           (id_cierre, id_prod, stock_teorico, stock_real, descongelar, faltante, cocinar, id_op_cocinar)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [idCierre, b.idProd, teoricoPorBase.get(b.idProd) ?? 0, b.stockReal, b.descongelar, b.faltante, b.kgACocinar, idOp]
      );
      await client.query(
        `INSERT INTO malaga.f_pcp_pronostico
           (fecha_plan, id_prod, demanda_pronosticada, stock_actual_momento, stock_minimo_momento,
            cocciones_pendientes_momento, necesario, cantidad_planificada, id_op_generada, user_generado)
         VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)`,
        [input.fechaPlan, b.idProd, b.necesidadFabricacion, b.stockReal, b.coccionesPendientes, b.aReponer, b.kgACocinar, idOp, input.userCierre]
      );
    }

    return { idCierre, opsFabricacion, opsCoccion };
  });
}

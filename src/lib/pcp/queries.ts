import { query, withTransaction } from "../db";
import { proyectarSiguiente, diaSemanaIso, calcularNecesario, calcularCantidadAPlanificar } from "./forecast";

export interface TotalSemanal {
  semana: string;
  total: number;
}

export async function getExhibicionesPorSemana(semanas = 8): Promise<TotalSemanal[]> {
  const result = await query<{ semana: string; total: string }>(
    `SELECT date_trunc('week', ps.ts_exhibicion)::date::text AS semana, SUM(ps.cantidad) AS total
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NOT NULL
       AND ps.ts_exhibicion >= date_trunc('week', CURRENT_DATE) - ($1 || ' weeks')::interval
       AND ps.ts_exhibicion < date_trunc('week', CURRENT_DATE)
     GROUP BY 1
     ORDER BY 1`,
    [semanas]
  );
  return result.rows.map((r) => ({ semana: r.semana, total: Number(r.total) }));
}

// dia_semana (1=lunes..7=domingo) -> fracción [0,1] del total exhibido en ese día,
// promediado sobre las últimas `semanas` semanas completas. Días sin historial no
// aparecen en el resultado (tratarlos como 0 queda a cargo de quien consuma esto).
export async function getDistribucionPorDia(semanas = 8): Promise<Record<number, number>> {
  const result = await query<{ dia_semana: number; total: string }>(
    `SELECT EXTRACT(ISODOW FROM ps.ts_exhibicion)::int AS dia_semana, SUM(ps.cantidad) AS total
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NOT NULL
       AND ps.ts_exhibicion >= date_trunc('week', CURRENT_DATE) - ($1 || ' weeks')::interval
       AND ps.ts_exhibicion < date_trunc('week', CURRENT_DATE)
     GROUP BY 1`,
    [semanas]
  );
  const totalGeneral = result.rows.reduce((acc, r) => acc + Number(r.total), 0);
  if (totalGeneral === 0) return {};

  const distribucion: Record<number, number> = {};
  for (const r of result.rows) {
    distribucion[r.dia_semana] = Number(r.total) / totalGeneral;
  }
  return distribucion;
}

// id_prod -> fracción [0,1] del total exhibido, solo entre productos actualmente en
// cartilla (los 24 slots de d_exhibidora).
export async function getDistribucionPorProducto(semanas = 8): Promise<Record<number, number>> {
  const result = await query<{ id_prod: number; total: string }>(
    `SELECT ps.id_prod, SUM(ps.cantidad) AS total
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NOT NULL
       AND ps.ts_exhibicion >= date_trunc('week', CURRENT_DATE) - ($1 || ' weeks')::interval
       AND ps.ts_exhibicion < date_trunc('week', CURRENT_DATE)
       AND ps.id_prod IN (SELECT id_prod FROM malaga.d_exhibidora)
     GROUP BY 1`,
    [semanas]
  );
  const totalGeneral = result.rows.reduce((acc, r) => acc + Number(r.total), 0);
  if (totalGeneral === 0) return {};

  const distribucion: Record<number, number> = {};
  for (const r of result.rows) {
    distribucion[r.id_prod] = Number(r.total) / totalGeneral;
  }
  return distribucion;
}

export interface FactorDia {
  diaSemana: number;
  factor: number;
}

export async function getFactoresDia(): Promise<FactorDia[]> {
  const result = await query<{ dia_semana: number; factor: string }>(
    `SELECT dia_semana, factor FROM malaga.pcp_factor_dia_semana ORDER BY dia_semana`
  );
  return result.rows.map((r) => ({ diaSemana: r.dia_semana, factor: Number(r.factor) }));
}

export async function setFactorDia(diaSemana: number, factor: number): Promise<void> {
  await query(`UPDATE malaga.pcp_factor_dia_semana SET factor = $2 WHERE dia_semana = $1`, [diaSemana, factor]);
}

export interface FactorProducto {
  idProd: number;
  productoDetalle: string;
  factor: number;
}

export async function listFactoresProducto(): Promise<FactorProducto[]> {
  const result = await query<{ id_prod: number; detalle: string; factor: string }>(
    `SELECT p.id_prod, p.detalle, COALESCE(f.factor, 1.0) AS factor
     FROM malaga.d_productos p
     LEFT JOIN malaga.pcp_factor_producto f ON f.id_prod = p.id_prod
     WHERE p.activo = true
     ORDER BY p.tipo_producto, p.detalle`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, productoDetalle: r.detalle, factor: Number(r.factor) }));
}

export async function setFactorProducto(idProd: number, factor: number): Promise<void> {
  await query(
    `INSERT INTO malaga.pcp_factor_producto (id_prod, factor) VALUES ($1, $2)
     ON CONFLICT (id_prod) DO UPDATE SET factor = EXCLUDED.factor`,
    [idProd, factor]
  );
}

export interface ConfigProducto {
  idProd: number;
  detalle: string;
  tipoProducto: "PT" | "SEMI";
  stockMinimo: number;
  loteOptimo: number | null;
  loteMinimo: number | null;
}

export async function getConfigTodosLosProductos(): Promise<Map<number, ConfigProducto>> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    tipo_producto: "PT" | "SEMI";
    stock_minimo: string;
    lote_optimo: string | null;
    lote_minimo: string | null;
  }>(`SELECT id_prod, detalle, tipo_producto, stock_minimo, lote_optimo, lote_minimo FROM malaga.d_productos`);

  const config = new Map<number, ConfigProducto>();
  for (const r of result.rows) {
    config.set(r.id_prod, {
      idProd: r.id_prod,
      detalle: r.detalle,
      tipoProducto: r.tipo_producto,
      stockMinimo: Number(r.stock_minimo),
      loteOptimo: r.lote_optimo === null ? null : Number(r.lote_optimo),
      loteMinimo: r.lote_minimo === null ? null : Number(r.lote_minimo),
    });
  }
  return config;
}

export async function getStockActualPorProducto(): Promise<Map<number, number>> {
  const result = await query<{ id_prod: number; total: string }>(
    `SELECT id_prod, SUM(cantidad) AS total FROM malaga.v_stock_pt_vivo GROUP BY id_prod
     UNION ALL
     SELECT id_prod, SUM(restante) AS total FROM malaga.v_stock_semi_vivo GROUP BY id_prod`
  );
  const stock = new Map<number, number>();
  for (const r of result.rows) {
    stock.set(r.id_prod, Number(r.total));
  }
  return stock;
}

export async function getCoccionesPendientesPorProducto(): Promise<Map<number, number>> {
  const result = await query<{ id_prod: number; total: string }>(
    `SELECT id_prod, SUM(cant_plan) AS total
     FROM malaga.f_ordenes_produccion
     WHERE estado IN ('planificada', 'en_proceso')
     GROUP BY id_prod`
  );
  const pendientes = new Map<number, number>();
  for (const r of result.rows) {
    pendientes.set(r.id_prod, Number(r.total));
  }
  return pendientes;
}

export interface ProductoEnCartilla {
  idProd: number;
  detalle: string;
}

export async function getProductosEnCartilla(): Promise<ProductoEnCartilla[]> {
  const result = await query<{ id_prod: number; detalle: string }>(
    `SELECT DISTINCT p.id_prod, p.detalle
     FROM malaga.d_exhibidora e
     JOIN malaga.d_productos p ON p.id_prod = e.id_prod
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, detalle: r.detalle }));
}

export interface ItemRecetaSemi {
  idSubprod: number;
  cantSubprod: string;
}

export async function getItemsRecetaSemiPorProducto(
  idsProdPt: number[]
): Promise<Map<number, ItemRecetaSemi[]>> {
  const items = new Map<number, ItemRecetaSemi[]>();
  if (idsProdPt.length === 0) return items;

  const result = await query<{ id_prod_padre: number; id_subprod: number; cant_subprod: string }>(
    `SELECT r.id_prod AS id_prod_padre, rd.id_subprod, rd.cant_subprod
     FROM malaga.recetas r
     JOIN malaga.recetas_detalles rd ON rd.id_receta = r.id_receta
     JOIN malaga.d_productos sp ON sp.id_prod = rd.id_subprod
     WHERE r.activa = true AND sp.tipo_producto = 'SEMI' AND r.id_prod = ANY($1::int[])`,
    [idsProdPt]
  );
  for (const r of result.rows) {
    const lista = items.get(r.id_prod_padre) ?? [];
    lista.push({ idSubprod: r.id_subprod, cantSubprod: r.cant_subprod });
    items.set(r.id_prod_padre, lista);
  }
  return items;
}

export interface FilaPlan {
  idProd: number;
  productoDetalle: string;
  tipoProducto: "PT" | "SEMI";
  demandaPronosticada: number;
  stockActual: number;
  stockMinimo: number;
  coccionesPendientes: number;
  necesario: number;
  cantidadAPlanificar: number;
}

export async function calcularPlanManana(factorPuntualSemana = 1): Promise<FilaPlan[]> {
  const semanas = await getExhibicionesPorSemana(8);
  const baseline = proyectarSiguiente(semanas.map((s) => s.total));

  const distribucionDia = await getDistribucionPorDia(8);
  const distribucionProducto = await getDistribucionPorProducto(8);
  const factoresDia = await getFactoresDia();
  const factorPorDia = new Map(factoresDia.map((f) => [f.diaSemana, f.factor]));

  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const diaManana = diaSemanaIso(manana);
  const pctDia = (distribucionDia[diaManana] ?? 0) * (factorPorDia.get(diaManana) ?? 1);

  const productosCartilla = await getProductosEnCartilla();
  const factoresProducto = await listFactoresProducto();
  const factorPorProducto = new Map(factoresProducto.map((f) => [f.idProd, f.factor]));
  const config = await getConfigTodosLosProductos();
  const stockPorProducto = await getStockActualPorProducto();
  const coccionesPorProducto = await getCoccionesPendientesPorProducto();

  const filasPt: FilaPlan[] = productosCartilla.map((prod) => {
    const pctProducto = (distribucionProducto[prod.idProd] ?? 0) * (factorPorProducto.get(prod.idProd) ?? 1);
    const demandaPronosticada = baseline * pctDia * pctProducto * factorPuntualSemana;
    const c = config.get(prod.idProd)!;
    const stockActual = stockPorProducto.get(prod.idProd) ?? 0;
    const coccionesPendientes = coccionesPorProducto.get(prod.idProd) ?? 0;
    const necesario = calcularNecesario({
      demanda: demandaPronosticada,
      stockActual,
      stockMinimo: c.stockMinimo,
      coccionesPendientes,
    });
    const cantidadAPlanificar = calcularCantidadAPlanificar({
      necesario,
      loteOptimo: c.loteOptimo,
      loteMinimo: c.loteMinimo,
    });
    return {
      idProd: prod.idProd,
      productoDetalle: prod.detalle,
      tipoProducto: "PT",
      demandaPronosticada,
      stockActual,
      stockMinimo: c.stockMinimo,
      coccionesPendientes,
      necesario,
      cantidadAPlanificar,
    };
  });

  const idsPtConProduccion = filasPt.filter((f) => f.cantidadAPlanificar > 0).map((f) => f.idProd);
  const itemsPorPt = await getItemsRecetaSemiPorProducto(idsPtConProduccion);
  const demandaSemi = new Map<number, number>();
  for (const fila of filasPt) {
    const items = itemsPorPt.get(fila.idProd);
    if (!items) continue;
    for (const item of items) {
      const acumulado = demandaSemi.get(item.idSubprod) ?? 0;
      demandaSemi.set(item.idSubprod, acumulado + Number(item.cantSubprod) * fila.cantidadAPlanificar);
    }
  }

  const filasSemi: FilaPlan[] = Array.from(demandaSemi.entries()).map(([idProdSemi, demanda]) => {
    const c = config.get(idProdSemi);
    const stockActual = stockPorProducto.get(idProdSemi) ?? 0;
    const coccionesPendientes = coccionesPorProducto.get(idProdSemi) ?? 0;
    const stockMinimo = c?.stockMinimo ?? 0;
    const necesario = calcularNecesario({ demanda, stockActual, stockMinimo, coccionesPendientes });
    const cantidadAPlanificar = calcularCantidadAPlanificar({
      necesario,
      loteOptimo: c?.loteOptimo ?? null,
      loteMinimo: c?.loteMinimo ?? null,
    });
    return {
      idProd: idProdSemi,
      productoDetalle: c?.detalle ?? `#${idProdSemi}`,
      tipoProducto: "SEMI",
      demandaPronosticada: demanda,
      stockActual,
      stockMinimo,
      coccionesPendientes,
      necesario,
      cantidadAPlanificar,
    };
  });

  return [...filasPt, ...filasSemi];
}

export interface FilaConfirmada {
  idProd: number;
  tipoProducto: "PT" | "SEMI";
  cantidadAPlanificar: number;
  demandaPronosticada: number;
  stockActual: number;
  stockMinimo: number;
  coccionesPendientes: number;
  necesario: number;
}

export async function generarPlanManana(
  filas: FilaConfirmada[],
  fechaPlan: string,
  factorPuntualSemana: number | null,
  userGenerado: number
): Promise<{ idsOp: number[] }> {
  return withTransaction(async (client) => {
    const idsOp: number[] = [];

    for (const fila of filas) {
      let idOp: number | null = null;
      if (fila.cantidadAPlanificar > 0) {
        // Réplica en línea de createOrdenProduccion (src/lib/ordenes/queries.ts), usando
        // el client de esta transacción en vez del pool: así la OP y el snapshot de
        // pronóstico de cada fila viven en la misma transacción que el resto del batch.
        // Muchos productos (sobre todo bases/SEMI) todavía no tienen una receta cargada.
        // No bloqueamos la planificación por eso: la OP queda sin receta y al finalizar
        // simplemente no hay ingredientes para descontar.
        const recetaResult = await client.query<{ id_receta: number }>(
          `SELECT id_receta FROM malaga.recetas WHERE id_prod = $1 AND activa = true`,
          [fila.idProd]
        );
        const idReceta = recetaResult.rows[0]?.id_receta ?? null;

        const opResult = await client.query<{ id_op: number }>(
          `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado)
           VALUES ($1, $2, $3, $4, 'planificada') RETURNING id_op`,
          [fila.idProd, idReceta, fila.cantidadAPlanificar, fechaPlan]
        );
        idOp = opResult.rows[0].id_op;
        idsOp.push(idOp);
      }

      await client.query(
        `INSERT INTO malaga.f_pcp_pronostico
           (fecha_plan, id_prod, demanda_pronosticada, stock_actual_momento, stock_minimo_momento,
            cocciones_pendientes_momento, necesario, cantidad_planificada, factor_puntual_semana,
            id_op_generada, user_generado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          fechaPlan,
          fila.idProd,
          fila.demandaPronosticada,
          fila.stockActual,
          fila.stockMinimo,
          fila.coccionesPendientes,
          fila.necesario,
          fila.cantidadAPlanificar,
          factorPuntualSemana,
          idOp,
          userGenerado,
        ]
      );
    }

    return { idsOp };
  });
}

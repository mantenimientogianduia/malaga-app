import { query } from "../db";

export interface StockPtVivo {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidad: string;
  lote: string;
  fechaFab: string;
  nroSlot: number | null;
}

export async function listStockPtVivo(): Promise<StockPtVivo[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    producto_detalle: string;
    cantidad: string;
    lote: string;
    fecha_fab: string;
    nro_slot: number | null;
  }>(
    `SELECT v.id_partistock, v.id_prod, p.detalle AS producto_detalle, v.cantidad, v.lote,
            v.fecha_fab::text AS fecha_fab, e.nro AS nro_slot
     FROM malaga.v_stock_pt_vivo v
     JOIN malaga.d_productos p ON p.id_prod = v.id_prod
     LEFT JOIN malaga.d_exhibidora e ON e.id_exhibidora = v.id_exhibidora
     ORDER BY e.nro NULLS LAST, p.detalle`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    cantidad: r.cantidad,
    lote: r.lote,
    fechaFab: r.fecha_fab,
    nroSlot: r.nro_slot,
  }));
}

export async function getVejezPromedioPtVivo(): Promise<number | null> {
  const result = await query<{ vejez_promedio: string | null }>(
    `SELECT
       CASE WHEN SUM(v.cantidad) > 0
         THEN SUM(v.cantidad * (CURRENT_DATE - v.fecha_fab)) / SUM(v.cantidad)
         ELSE NULL
       END AS vejez_promedio
     FROM malaga.v_stock_pt_vivo v`
  );
  const val = result.rows[0]?.vejez_promedio;
  return val === null || val === undefined ? null : Number(val);
}

export interface StockSemiVivo {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidadInicial: string;
  restante: string;
  lote: string;
}

export async function listStockSemiVivo(): Promise<StockSemiVivo[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    producto_detalle: string;
    cantidad_inicial: string;
    restante: string;
    lote: string;
  }>(
    `SELECT v.id_partistock, v.id_prod, p.detalle AS producto_detalle, v.cantidad_inicial, v.restante, v.lote
     FROM malaga.v_stock_semi_vivo v
     JOIN malaga.d_productos p ON p.id_prod = v.id_prod
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    cantidadInicial: r.cantidad_inicial,
    restante: r.restante,
    lote: r.lote,
  }));
}

export interface ConsumoDiario {
  fecha: string;
  cantidad: string;
}

export async function listConsumoDiarioPorProducto(idProd: number, dias = 14): Promise<ConsumoDiario[]> {
  const result = await query<{ fecha: string; cantidad: string }>(
    `SELECT to_char(o.fecha_real, 'YYYY-MM-DD') AS fecha, SUM(t.cant_subprod) AS cantidad
     FROM malaga.f_trazabilidad_op t
     JOIN malaga.f_ordenes_produccion o ON o.id_op = t.id_op
     WHERE t.id_subprod = $1 AND o.fecha_real >= (CURRENT_DATE - ($2 || ' days')::interval)
     GROUP BY o.fecha_real
     ORDER BY o.fecha_real DESC`,
    [idProd, dias]
  );
  return result.rows;
}

export type MotivoBaja = "scrap" | "vencido" | "ajuste";

export async function cerrarRemanenteSemi(
  idPartida: number,
  motivo: MotivoBaja,
  userBaja: number
): Promise<void> {
  await query(
    `UPDATE malaga.f_partidas_stock
     SET ts_baja_manual = now(), motivo_baja_manual = $2, user_baja_manual = $3
     WHERE id_partistock = $1`,
    [idPartida, motivo, userBaja]
  );
}

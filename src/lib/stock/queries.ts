import { query } from "../db";

export interface StockPtVivo {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidad: string;
  lote: string;
  fechaFab: string;
}

export async function listStockPtVivo(): Promise<StockPtVivo[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    producto_detalle: string;
    cantidad: string;
    lote: string;
    fecha_fab: string;
  }>(
    `SELECT v.id_partistock, v.id_prod, p.detalle AS producto_detalle, v.cantidad, v.lote,
            v.fecha_fab::text AS fecha_fab
     FROM malaga.v_stock_pt_vivo v
     JOIN malaga.d_productos p ON p.id_prod = v.id_prod
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    cantidad: r.cantidad,
    lote: r.lote,
    fechaFab: r.fecha_fab,
  }));
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

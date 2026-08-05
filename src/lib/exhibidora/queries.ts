import { query } from "../db";

export interface SlotPlanificacion {
  idExhibidora: number;
  nro: number;
  sucursal: string;
  idProd: number;
  productoDetalle: string;
  pesoEstandar: string;
  cantidadMinima: string;
  stockActual: string;
  faltante: string;
  bachasSugeridas: number;
  cantidadSugerida: string;
}

export async function listPlanificacion(): Promise<SlotPlanificacion[]> {
  const result = await query<{
    id_exhibidora: number;
    nro: number;
    sucursal: string;
    id_prod: number;
    producto_detalle: string;
    peso_estandar: string;
    cantidad_minima: string;
    stock_actual: string;
    faltante: string;
    bachas_sugeridas: string;
    cantidad_sugerida: string;
  }>(
    `SELECT id_exhibidora, nro, sucursal, id_prod, producto_detalle, peso_estandar,
            cantidad_minima, stock_actual, faltante, bachas_sugeridas, cantidad_sugerida
     FROM malaga.v_planificacion_diaria
     ORDER BY nro`
  );
  return result.rows.map((r) => ({
    idExhibidora: r.id_exhibidora,
    nro: r.nro,
    sucursal: r.sucursal,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    pesoEstandar: r.peso_estandar,
    cantidadMinima: r.cantidad_minima,
    stockActual: r.stock_actual,
    faltante: r.faltante,
    bachasSugeridas: Number(r.bachas_sugeridas),
    cantidadSugerida: r.cantidad_sugerida,
  }));
}

export async function cambiarSaborSlot(idExhibidora: number, idProdNuevo: number): Promise<void> {
  await query(
    `UPDATE malaga.d_exhibidora
     SET id_prod_ant = id_prod, id_prod = $2, ts_ulticambio = now()
     WHERE id_exhibidora = $1`,
    [idExhibidora, idProdNuevo]
  );
}

export async function actualizarMinimo(idExhibidora: number, cantidadMinima: number): Promise<void> {
  await query(`UPDATE malaga.d_exhibidora SET cantidad_minima = $2 WHERE id_exhibidora = $1`, [
    idExhibidora,
    cantidadMinima,
  ]);
}

export interface PartidaEnObrador {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidad: string;
  lote: string;
  fechaFab: string;
  idExhibidoraDestino: number | null;
}

export async function listPartidasEnObrador(): Promise<PartidaEnObrador[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    producto_detalle: string;
    cantidad: string;
    lote: string;
    fecha_fab: string;
    id_exhibidora_destino: number | null;
  }>(
    `SELECT ps.id_partistock, ps.id_prod, p.detalle AS producto_detalle, ps.cantidad, ps.lote,
            ps.fecha_fab::text AS fecha_fab, e.id_exhibidora AS id_exhibidora_destino
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     LEFT JOIN malaga.d_exhibidora e ON e.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL
     ORDER BY ps.fecha_fab, ps.id_partistock`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    cantidad: r.cantidad,
    lote: r.lote,
    fechaFab: r.fecha_fab,
    idExhibidoraDestino: r.id_exhibidora_destino,
  }));
}

export async function exhibirPartida(
  idPartida: number,
  idExhibidora: number,
  userExhibicion: number
): Promise<void> {
  await query(
    `UPDATE malaga.f_partidas_stock
     SET ts_exhibicion = now(), id_exhibidora = $2, user_exhibicion = $3
     WHERE id_partistock = $1`,
    [idPartida, idExhibidora, userExhibicion]
  );
}

export interface ExhibicionReciente {
  idPartida: number;
  productoDetalle: string;
  cantidad: string;
  lote: string;
  tsExhibicion: string;
  userExhibicion: string | null;
}

export async function listExhibicionesRecientes(limite = 15): Promise<ExhibicionReciente[]> {
  const result = await query<{
    id_partistock: number;
    producto_detalle: string;
    cantidad: string;
    lote: string;
    ts_exhibicion: string;
    user_exhibicion: string | null;
  }>(
    `SELECT ps.id_partistock, p.detalle AS producto_detalle, ps.cantidad, ps.lote,
            ps.ts_exhibicion::text AS ts_exhibicion, u.email AS user_exhibicion
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     LEFT JOIN malaga.usuarios u ON u.id_user = ps.user_exhibicion
     WHERE ps.ts_exhibicion IS NOT NULL
     ORDER BY ps.ts_exhibicion DESC
     LIMIT $1`,
    [limite]
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    productoDetalle: r.producto_detalle,
    cantidad: r.cantidad,
    lote: r.lote,
    tsExhibicion: r.ts_exhibicion,
    userExhibicion: r.user_exhibicion,
  }));
}

export async function deshacerExhibicion(idPartida: number): Promise<void> {
  await query(
    `UPDATE malaga.f_partidas_stock
     SET ts_exhibicion = NULL, id_exhibidora = NULL, user_exhibicion = NULL
     WHERE id_partistock = $1`,
    [idPartida]
  );
}

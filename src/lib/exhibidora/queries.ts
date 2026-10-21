import { query, withTransaction } from "../db";
import type { MotivoBaja } from "../stock/queries";
import { fechaEnMalaga } from "../pcp/fechas";

export interface CartillaSlot {
  idExhibidora: number;
  nro: number;
  idProd: number;
  productoDetalle: string;
  idProdAnt: number | null;
  productoAntDetalle: string | null;
  tsUltimoCambio: string | null;
  idProdFut: number | null;
  productoFutDetalle: string | null;
  fechaCambioProgramado: string | null;
}

export async function listCartillaActual(): Promise<CartillaSlot[]> {
  const result = await query<{
    id_exhibidora: number;
    nro: number;
    id_prod: number;
    producto_detalle: string;
    id_prod_ant: number | null;
    producto_ant_detalle: string | null;
    ts_ulticambio: string | null;
    id_prod_fut: number | null;
    producto_fut_detalle: string | null;
    fecha_cambio_programado: string | null;
  }>(
    `SELECT e.id_exhibidora, e.nro, e.id_prod, p.detalle AS producto_detalle,
            e.id_prod_ant, pa.detalle AS producto_ant_detalle, e.ts_ulticambio::text AS ts_ulticambio,
            e.id_prod_fut, pf.detalle AS producto_fut_detalle,
            e.ts_cambio_programado::date::text AS fecha_cambio_programado
     FROM malaga.d_exhibidora e
     JOIN malaga.d_productos p ON p.id_prod = e.id_prod
     LEFT JOIN malaga.d_productos pa ON pa.id_prod = e.id_prod_ant
     LEFT JOIN malaga.d_productos pf ON pf.id_prod = e.id_prod_fut
     ORDER BY e.nro`
  );
  return result.rows.map((r) => ({
    idExhibidora: r.id_exhibidora,
    nro: r.nro,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    idProdAnt: r.id_prod_ant,
    productoAntDetalle: r.producto_ant_detalle,
    tsUltimoCambio: r.ts_ulticambio,
    idProdFut: r.id_prod_fut,
    productoFutDetalle: r.producto_fut_detalle,
    fechaCambioProgramado: r.fecha_cambio_programado,
  }));
}

export async function programarCambio(
  idExhibidora: number,
  idProdNuevo: number,
  fechaProgramada: string
): Promise<void> {
  await query(
    `UPDATE malaga.d_exhibidora SET id_prod_fut = $2, ts_cambio_programado = $3::date WHERE id_exhibidora = $1`,
    [idExhibidora, idProdNuevo, fechaProgramada]
  );
}

export async function cancelarCambioProgramado(idExhibidora: number): Promise<void> {
  await query(
    `UPDATE malaga.d_exhibidora SET id_prod_fut = NULL, ts_cambio_programado = NULL WHERE id_exhibidora = $1`,
    [idExhibidora]
  );
}

export async function oficializarCambio(idExhibidora: number): Promise<void> {
  await query(
    `UPDATE malaga.d_exhibidora
     SET id_prod_ant = id_prod, id_prod = id_prod_fut, id_prod_fut = NULL,
         ts_ulticambio = now(), ts_cambio_programado = NULL
     WHERE id_exhibidora = $1 AND id_prod_fut IS NOT NULL`,
    [idExhibidora]
  );
}

export async function listIdsEnCartillaOProgramados(): Promise<number[]> {
  const result = await query<{ id_prod: number }>(
    `SELECT id_prod FROM malaga.d_exhibidora
     UNION
     SELECT id_prod_fut FROM malaga.d_exhibidora WHERE id_prod_fut IS NOT NULL`
  );
  return result.rows.map((r) => r.id_prod);
}

export interface PartidaEnObrador {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidad: string;
  lote: string;
  fechaFab: string;
  idExhibidoraDestino: number | null;
  rolEnSlot: "actual" | "entrante" | null;
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
    rol_en_slot: "actual" | "entrante" | null;
  }>(
    `SELECT ps.id_partistock, ps.id_prod, p.detalle AS producto_detalle, ps.cantidad, ps.lote,
            ps.fecha_fab::text AS fecha_fab,
            COALESCE(e_actual.id_exhibidora, e_fut.id_exhibidora) AS id_exhibidora_destino,
            CASE WHEN e_actual.id_exhibidora IS NOT NULL THEN 'actual'
                 WHEN e_fut.id_exhibidora IS NOT NULL THEN 'entrante'
                 ELSE NULL END AS rol_en_slot
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     LEFT JOIN malaga.d_exhibidora e_actual ON e_actual.id_prod = ps.id_prod
     LEFT JOIN malaga.d_exhibidora e_fut ON e_fut.id_prod_fut = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL AND ps.ts_baja_manual IS NULL
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
    rolEnSlot: r.rol_en_slot,
  }));
}

export async function exhibirPartida(
  idPartida: number,
  idExhibidora: number,
  userExhibicion: number,
  oficializarCambioAhora = false,
  tsExhibicion?: string | null
): Promise<void> {
  const ts = tsExhibicion ? new Date(tsExhibicion) : null;
  if (ts !== null && Number.isNaN(ts.getTime())) {
    throw new Error("La fecha y hora de exhibición no son válidas.");
  }
  // 1 minuto de tolerancia por si el reloj del dispositivo va levemente adelantado.
  if (ts !== null && ts.getTime() > Date.now() + 60_000) {
    throw new Error("La fecha y hora de exhibición no pueden ser futuras.");
  }
  const tsParam = ts === null ? null : ts.toISOString();

  await withTransaction(async (client) => {
    const previa = await client.query<{ fecha_fab: string; ts_baja_manual: string | null }>(
      `SELECT fecha_fab::text AS fecha_fab, ts_baja_manual::text AS ts_baja_manual
       FROM malaga.f_partidas_stock WHERE id_partistock = $1 FOR UPDATE`,
      [idPartida]
    );
    const fila = previa.rows[0];
    if (!fila) throw new Error("La bacha no existe.");
    if (fila.ts_baja_manual !== null) throw new Error("Esa bacha está dada de baja y no se puede exhibir.");
    if (ts !== null && fechaEnMalaga(ts) < fila.fecha_fab) {
      throw new Error("La exhibición no puede ser anterior al día de fabricación de la bacha.");
    }

    const partidaResult = await client.query<{ id_prod: number }>(
      `UPDATE malaga.f_partidas_stock
       SET ts_exhibicion = COALESCE($4::timestamptz, now()), id_exhibidora = $2, user_exhibicion = $3
       WHERE id_partistock = $1
       RETURNING id_prod`,
      [idPartida, idExhibidora, userExhibicion, tsParam]
    );
    const idProd = partidaResult.rows[0].id_prod;

    if (oficializarCambioAhora) {
      await client.query(
        `UPDATE malaga.d_exhibidora
         SET id_prod_ant = id_prod, id_prod = id_prod_fut, id_prod_fut = NULL,
             ts_ulticambio = now(), ts_cambio_programado = NULL
         WHERE id_exhibidora = $1 AND id_prod_fut IS NOT NULL`,
        [idExhibidora]
      );
    }

    // El quiebre se cierra en el momento de la exhibición, pero nunca antes de que haya empezado.
    await client.query(
      `UPDATE malaga.f_quiebres
       SET ts_repuesto = GREATEST(ts_quiebre_real, COALESCE($3::timestamptz, now())), id_partida_repuso = $2
       WHERE id_prod = $1 AND ts_repuesto IS NULL`,
      [idProd, idPartida, tsParam]
    );
  });
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

// Baja manual de una bacha de PT que nunca se exhibió (descarte, vencimiento o ajuste de stock).
export async function darDeBajaBachaPt(
  idPartida: number,
  motivo: MotivoBaja,
  observacion: string,
  userBaja: number
): Promise<void> {
  if (!["scrap", "vencido", "ajuste"].includes(motivo)) {
    throw new Error("Elegí el motivo de la baja.");
  }
  const obs = observacion.trim();
  if (obs === "") {
    throw new Error("Escribí la observación de la baja.");
  }

  const result = await query(
    `UPDATE malaga.f_partidas_stock ps
     SET ts_baja_manual = now(), motivo_baja_manual = $2, obs_baja_manual = $3, user_baja_manual = $4
     FROM malaga.d_productos p
     WHERE ps.id_partistock = $1 AND p.id_prod = ps.id_prod AND p.tipo_producto = 'PT'
       AND ps.ts_exhibicion IS NULL AND ps.ts_baja_manual IS NULL`,
    [idPartida, motivo, obs, userBaja]
  );
  if (result.rowCount === 0) {
    throw new Error("No se pudo dar de baja: la bacha ya fue exhibida o dada de baja.");
  }
}

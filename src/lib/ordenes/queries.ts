import { query, withTransaction } from "../db";

export type EstadoOrden = "planificada" | "en_proceso" | "finalizada" | "cancelada";

export interface OrdenProduccion {
  idOp: number;
  idProd: number;
  productoDetalle: string;
  cantPlan: string;
  cantReal: string | null;
  fechaPlan: string;
  fechaReal: string | null;
  tsIni: string | null;
  estado: EstadoOrden;
}

interface OrdenRow {
  id_op: number;
  id_prod: number;
  producto_detalle: string;
  cant_plan: string;
  cant_real: string | null;
  fecha_plan: string;
  fecha_real: string | null;
  ts_ini: Date | null;
  estado: EstadoOrden;
}

function mapOrdenRow(row: OrdenRow): OrdenProduccion {
  return {
    idOp: row.id_op,
    idProd: row.id_prod,
    productoDetalle: row.producto_detalle,
    cantPlan: row.cant_plan,
    cantReal: row.cant_real,
    fechaPlan: row.fecha_plan,
    fechaReal: row.fecha_real,
    tsIni: row.ts_ini ? row.ts_ini.toISOString() : null,
    estado: row.estado,
  };
}

const ORDEN_SELECT = `o.id_op, o.id_prod, p.detalle AS producto_detalle, o.cant_plan, o.cant_real,
       o.fecha_plan::text AS fecha_plan, o.fecha_real::text AS fecha_real, o.ts_ini, o.estado`;

export async function listOrdenes(): Promise<OrdenProduccion[]> {
  const result = await query<OrdenRow>(
    `SELECT ${ORDEN_SELECT}
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     ORDER BY o.fecha_plan DESC, o.id_op DESC`
  );
  return result.rows.map(mapOrdenRow);
}

export async function listOrdenesPorProducto(idProd: number, limite = 10): Promise<OrdenProduccion[]> {
  const result = await query<OrdenRow>(
    `SELECT ${ORDEN_SELECT}
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     WHERE o.id_prod = $1
     ORDER BY o.fecha_plan DESC, o.id_op DESC
     LIMIT $2`,
    [idProd, limite]
  );
  return result.rows.map(mapOrdenRow);
}

export interface ProductoParaOrden {
  idProd: number;
  detalle: string;
  tipoProducto: "PT" | "SEMI";
  sector: string | null;
  pesoEstandar: string | null;
}

export async function listProductosParaOrden(): Promise<ProductoParaOrden[]> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    tipo_producto: "PT" | "SEMI";
    sector: string | null;
    peso_estandar: string | null;
  }>(
    `SELECT p.id_prod, p.detalle, p.tipo_producto, p.sector, p.peso_estandar
     FROM malaga.d_productos p
     WHERE p.activo = true
     ORDER BY p.sector NULLS LAST, p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    tipoProducto: r.tipo_producto,
    sector: r.sector,
    pesoEstandar: r.peso_estandar,
  }));
}

export interface CreateOrdenInput {
  idProd: number;
  cantPlan: number;
  fechaPlan: string;
}

export async function createOrdenProduccion(input: CreateOrdenInput): Promise<{ idOp: number }> {
  // Muchos productos (sobre todo bases/SEMI) todavía no tienen una receta cargada.
  // No bloqueamos la planificación por eso: la OP queda sin receta y al finalizar
  // simplemente no hay ingredientes para descontar.
  const recetaResult = await query<{ id_receta: number }>(
    `SELECT id_receta FROM malaga.recetas WHERE id_prod = $1 AND activa = true`,
    [input.idProd]
  );
  const idReceta = recetaResult.rows[0]?.id_receta ?? null;

  const result = await query<{ id_op: number }>(
    `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado)
     VALUES ($1, $2, $3, $4, 'planificada') RETURNING id_op`,
    [input.idProd, idReceta, input.cantPlan, input.fechaPlan]
  );
  return { idOp: result.rows[0].id_op };
}

export async function iniciarOrdenRapido(idOp: number, userIni: number): Promise<void> {
  const result = await query(
    `UPDATE malaga.f_ordenes_produccion
     SET estado = 'en_proceso', ts_ini = now(), user_ini = $2
     WHERE id_op = $1 AND estado = 'planificada'`,
    [idOp, userIni]
  );
  if (result.rowCount === 0) {
    throw new Error("Esta OP ya no está planificada; no se puede iniciar");
  }
}

export async function iniciarOrdenConHorario(idOp: number, horarioIso: string, userIni: number): Promise<void> {
  // horarioIso ya viene convertido a ISO con offset desde el navegador (ver
  // IniciarControls.tsx) — se confía en el reloj del dispositivo del local en
  // vez de asumir una zona horaria fija del lado del servidor.
  const result = await query(
    `UPDATE malaga.f_ordenes_produccion
     SET estado = 'en_proceso', ts_ini = $2::timestamptz, user_ini = $3
     WHERE id_op = $1 AND estado = 'planificada'`,
    [idOp, horarioIso, userIni]
  );
  if (result.rowCount === 0) {
    throw new Error("Esta OP ya no está planificada; no se puede iniciar");
  }
}

export interface PartidaDisponible {
  idPartida: number;
  lote: string;
  restante: string;
}

export interface RecetaItemParaFinalizar {
  idDetalleReceta: number;
  idSubprod: number;
  subprodDetalle: string;
  cantSugerida: string;
  partidasDisponibles: PartidaDisponible[];
}

export interface OrdenParaFinalizar {
  idOp: number;
  idProd: number;
  productoDetalle: string;
  cantPlan: string;
  estado: EstadoOrden;
  tsIni: string | null;
  items: RecetaItemParaFinalizar[];
}

export async function getOrdenParaFinalizar(idOp: number): Promise<OrdenParaFinalizar | null> {
  const opResult = await query<{
    id_op: number;
    id_prod: number;
    producto_detalle: string;
    id_receta: number | null;
    cant_plan: string;
    estado: EstadoOrden;
    ts_ini: Date | null;
  }>(
    `SELECT o.id_op, o.id_prod, p.detalle AS producto_detalle, o.id_receta, o.cant_plan, o.estado, o.ts_ini
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     WHERE o.id_op = $1`,
    [idOp]
  );
  if (opResult.rows.length === 0) return null;
  const op = opResult.rows[0];

  const items: RecetaItemParaFinalizar[] = [];
  if (op.id_receta !== null) {
    const detallesResult = await query<{
      id_det_receta: number;
      id_subprod: number;
      subprod_detalle: string;
      subprod_tipo: "PT" | "SEMI";
      cant_subprod: string;
    }>(
      `SELECT rd.id_det_receta, rd.id_subprod, sp.detalle AS subprod_detalle, sp.tipo_producto AS subprod_tipo,
              rd.cant_subprod
       FROM malaga.recetas_detalles rd
       JOIN malaga.d_productos sp ON sp.id_prod = rd.id_subprod
       WHERE rd.id_receta = $1
       ORDER BY sp.detalle`,
      [op.id_receta]
    );

    for (const d of detallesResult.rows) {
      const partidasResult =
        d.subprod_tipo === "PT"
          ? await query<{ id_partistock: number; lote: string; cantidad: string }>(
              `SELECT id_partistock, lote, cantidad FROM malaga.v_stock_pt_vivo WHERE id_prod = $1 ORDER BY lote`,
              [d.id_subprod]
            )
          : await query<{ id_partistock: number; lote: string; restante: string }>(
              `SELECT id_partistock, lote, restante FROM malaga.v_stock_semi_vivo WHERE id_prod = $1 ORDER BY lote`,
              [d.id_subprod]
            );

      items.push({
        idDetalleReceta: d.id_det_receta,
        idSubprod: d.id_subprod,
        subprodDetalle: d.subprod_detalle,
        cantSugerida: d.cant_subprod,
        partidasDisponibles: partidasResult.rows.map((r) => ({
          idPartida: r.id_partistock,
          lote: r.lote,
          restante: "restante" in r ? r.restante : r.cantidad,
        })),
      });
    }
  }

  return {
    idOp: op.id_op,
    idProd: op.id_prod,
    productoDetalle: op.producto_detalle,
    cantPlan: op.cant_plan,
    estado: op.estado,
    tsIni: op.ts_ini ? op.ts_ini.toISOString() : null,
    items,
  };
}

export interface ConsumoInput {
  idDetalleReceta: number;
  idSubprod: number;
  idPartidaSubprod: number | null;
  cantSubprod: number;
}

export interface FinalizarOrdenInput {
  idOp: number;
  cantReal: number;
  tsIni: string;
  tsFin: string;
  tsFinLocal: string;
  userFin: number;
  consumos: ConsumoInput[];
}

export async function finalizarOrden(input: FinalizarOrdenInput): Promise<{ idPartida: number }> {
  return withTransaction(async (client) => {
    const opResult = await client.query<{
      id_prod: number;
      id_receta: number | null;
      estado: EstadoOrden;
      codigo: string | null;
    }>(
      `SELECT o.id_prod, o.id_receta, o.estado, p.codigo
       FROM malaga.f_ordenes_produccion o
       JOIN malaga.d_productos p ON p.id_prod = o.id_prod
       WHERE o.id_op = $1 FOR UPDATE`,
      [input.idOp]
    );
    if (opResult.rows.length === 0) {
      throw new Error("OP no encontrada");
    }
    const op = opResult.rows[0];
    if (op.estado === "finalizada") {
      throw new Error("Esta OP ya fue finalizada");
    }
    if (op.estado === "cancelada") {
      throw new Error("Esta OP está cancelada");
    }

    // tsIni/tsFin llegan como ISO con offset (convertidos en el navegador, ver
    // FinalizarForm.tsx) — se confía en el reloj del dispositivo del local en vez de
    // asumir una zona horaria fija del lado del servidor. tsFinLocal es la hora tal
    // como la vio/tipeó la persona (sin conversión), usada solo para el texto del lote
    // y la fecha de fabricación, para que el lote coincida con lo que esa persona leyó.
    const lote = `${op.codigo ?? `OP-${input.idOp}-`}${(() => {
      const [fecha, hora] = input.tsFinLocal.split("T");
      const [y, m, d] = fecha.split("-");
      return `${d}/${m}/${y} ${hora}${hora.length === 5 ? ":00" : ""}`;
    })()}`;

    const partidaResult = await client.query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, id_op_origen)
       VALUES ($1, $2, $3::date, $4, $5) RETURNING id_partistock`,
      [op.id_prod, input.cantReal, input.tsFinLocal.slice(0, 10), lote, input.idOp]
    );
    const idPartida = partidaResult.rows[0].id_partistock;

    // Regla clave del spec: nunca validar cant_subprod contra el restante calculado.
    // El pesaje real nunca es exacto, y la partida consumida puede quedar sin elegir
    // (sin stock cargado todavía) — se registra igual, sin bloquear el cierre de la OP.
    for (const c of input.consumos) {
      await client.query(
        `INSERT INTO malaga.f_trazabilidad_op
           (id_op, id_receta, id_detalle_receta, id_subprod, cant_subprod, id_parti_subprod, id_prod_op)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [input.idOp, op.id_receta, c.idDetalleReceta, c.idSubprod, c.cantSubprod, c.idPartidaSubprod, op.id_prod]
      );
    }

    await client.query(
      `UPDATE malaga.f_ordenes_produccion
       SET estado = 'finalizada', cant_real = $2, fecha_real = $3::date,
           ts_ini = $4::timestamptz, ts_fin = $5::timestamptz, user_ini = COALESCE(user_ini, $6), user_fin = $6
       WHERE id_op = $1`,
      [input.idOp, input.cantReal, input.tsFinLocal.slice(0, 10), input.tsIni, input.tsFin, input.userFin]
    );

    return { idPartida };
  });
}

export interface OrdenReciente {
  idOp: number;
  productoDetalle: string;
  cantPlan: string;
  cantReal: string | null;
  fechaPlan: string;
  tsIni: string | null;
  estado: EstadoOrden;
}

export async function listOrdenesRecientes(limite = 15): Promise<OrdenReciente[]> {
  const result = await query<{
    id_op: number;
    producto_detalle: string;
    cant_plan: string;
    cant_real: string | null;
    fecha_plan: string;
    ts_ini: Date | null;
    estado: EstadoOrden;
  }>(
    `SELECT o.id_op, p.detalle AS producto_detalle, o.cant_plan, o.cant_real,
            o.fecha_plan::text AS fecha_plan, o.ts_ini, o.estado
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     WHERE o.estado IN ('planificada', 'en_proceso', 'finalizada')
     ORDER BY COALESCE(o.ts_fin, o.ts_ini, o.fecha_plan::timestamptz) DESC, o.id_op DESC
     LIMIT $1`,
    [limite]
  );
  return result.rows.map((r) => ({
    idOp: r.id_op,
    productoDetalle: r.producto_detalle,
    cantPlan: r.cant_plan,
    cantReal: r.cant_real,
    fechaPlan: r.fecha_plan,
    tsIni: r.ts_ini ? r.ts_ini.toISOString() : null,
    estado: r.estado,
  }));
}

export async function cancelarOrdenPlanificada(idOp: number): Promise<void> {
  const result = await query(
    `UPDATE malaga.f_ordenes_produccion SET estado = 'cancelada' WHERE id_op = $1 AND estado = 'planificada'`,
    [idOp]
  );
  if (result.rowCount === 0) {
    throw new Error("Esta OP ya no está planificada; no se puede cancelar");
  }
}

export async function deshacerInicio(idOp: number): Promise<void> {
  const result = await query(
    `UPDATE malaga.f_ordenes_produccion
     SET estado = 'planificada', ts_ini = NULL, user_ini = NULL
     WHERE id_op = $1 AND estado = 'en_proceso'`,
    [idOp]
  );
  if (result.rowCount === 0) {
    throw new Error("Esta OP no está en proceso; no se puede deshacer el inicio");
  }
}

export async function deshacerFinalizacion(idOp: number): Promise<void> {
  await withTransaction(async (client) => {
    const partidaResult = await client.query<{ id_partistock: number; ts_exhibicion: string | null }>(
      `SELECT id_partistock, ts_exhibicion FROM malaga.f_partidas_stock WHERE id_op_origen = $1 FOR UPDATE`,
      [idOp]
    );
    if (partidaResult.rows.length === 0) {
      throw new Error("Esta OP no tiene una partida generada; no hay nada que deshacer");
    }
    const partida = partidaResult.rows[0];
    if (partida.ts_exhibicion !== null) {
      throw new Error("La partida generada por esta OP ya fue exhibida; deshacé la exhibición primero");
    }

    await client.query(`DELETE FROM malaga.f_trazabilidad_op WHERE id_op = $1`, [idOp]);
    await client.query(`DELETE FROM malaga.f_partidas_stock WHERE id_partistock = $1`, [partida.id_partistock]);
    // Vuelve a "en proceso" (no a "planificada"): ts_ini se conserva, así el reloj
    // sigue corriendo desde el inicio real en vez de perderse.
    await client.query(
      `UPDATE malaga.f_ordenes_produccion
       SET estado = 'en_proceso', cant_real = NULL, fecha_real = NULL, ts_fin = NULL, user_fin = NULL
       WHERE id_op = $1`,
      [idOp]
    );
  });
}

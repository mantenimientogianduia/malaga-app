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
    estado: row.estado,
  };
}

export async function listOrdenes(): Promise<OrdenProduccion[]> {
  const result = await query<OrdenRow>(
    `SELECT o.id_op, o.id_prod, p.detalle AS producto_detalle, o.cant_plan, o.cant_real,
            o.fecha_plan::text AS fecha_plan, o.fecha_real::text AS fecha_real, o.estado
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     ORDER BY o.fecha_plan DESC, o.id_op DESC`
  );
  return result.rows.map(mapOrdenRow);
}

export async function listOrdenesPorProducto(idProd: number, limite = 10): Promise<OrdenProduccion[]> {
  const result = await query<OrdenRow>(
    `SELECT o.id_op, o.id_prod, p.detalle AS producto_detalle, o.cant_plan, o.cant_real,
            o.fecha_plan::text AS fecha_plan, o.fecha_real::text AS fecha_real, o.estado
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     WHERE o.id_prod = $1
     ORDER BY o.fecha_plan DESC, o.id_op DESC
     LIMIT $2`,
    [idProd, limite]
  );
  return result.rows.map(mapOrdenRow);
}

export interface ProductoConReceta {
  idProd: number;
  detalle: string;
  tipoProducto: "PT" | "SEMI";
  pesoEstandar: string | null;
}

export async function listProductosConRecetaActiva(): Promise<ProductoConReceta[]> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    tipo_producto: "PT" | "SEMI";
    peso_estandar: string | null;
  }>(
    `SELECT DISTINCT p.id_prod, p.detalle, p.tipo_producto, p.peso_estandar
     FROM malaga.d_productos p
     JOIN malaga.recetas r ON r.id_prod = p.id_prod AND r.activa = true
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    tipoProducto: r.tipo_producto,
    pesoEstandar: r.peso_estandar,
  }));
}

export interface CreateOrdenInput {
  idProd: number;
  cantPlan: number;
  fechaPlan: string;
}

export async function createOrdenProduccion(input: CreateOrdenInput): Promise<{ idOp: number }> {
  const recetaResult = await query<{ id_receta: number }>(
    `SELECT id_receta FROM malaga.recetas WHERE id_prod = $1 AND activa = true`,
    [input.idProd]
  );
  if (recetaResult.rows.length === 0) {
    throw new Error("Este producto no tiene una receta activa; no se puede planificar una OP");
  }
  const idReceta = recetaResult.rows[0].id_receta;

  const result = await query<{ id_op: number }>(
    `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado)
     VALUES ($1, $2, $3, $4, 'planificada') RETURNING id_op`,
    [input.idProd, idReceta, input.cantPlan, input.fechaPlan]
  );
  return { idOp: result.rows[0].id_op };
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
  items: RecetaItemParaFinalizar[];
}

export async function getOrdenParaFinalizar(idOp: number): Promise<OrdenParaFinalizar | null> {
  const opResult = await query<{
    id_op: number;
    id_prod: number;
    producto_detalle: string;
    id_receta: number;
    cant_plan: string;
    estado: EstadoOrden;
  }>(
    `SELECT o.id_op, o.id_prod, p.detalle AS producto_detalle, o.id_receta, o.cant_plan, o.estado
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     WHERE o.id_op = $1`,
    [idOp]
  );
  if (opResult.rows.length === 0) return null;
  const op = opResult.rows[0];

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

  const items: RecetaItemParaFinalizar[] = [];
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

  return {
    idOp: op.id_op,
    idProd: op.id_prod,
    productoDetalle: op.producto_detalle,
    cantPlan: op.cant_plan,
    estado: op.estado,
    items,
  };
}

export interface ConsumoInput {
  idDetalleReceta: number;
  idSubprod: number;
  idPartidaSubprod: number;
  cantSubprod: number;
}

export interface FinalizarOrdenInput {
  idOp: number;
  cantReal: number;
  lote: string;
  fechaFab: string;
  userFin: number;
  consumos: ConsumoInput[];
}

export async function finalizarOrden(input: FinalizarOrdenInput): Promise<{ idPartida: number }> {
  return withTransaction(async (client) => {
    const opResult = await client.query<{ id_prod: number; id_receta: number; estado: EstadoOrden }>(
      `SELECT id_prod, id_receta, estado FROM malaga.f_ordenes_produccion WHERE id_op = $1 FOR UPDATE`,
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

    const partidaResult = await client.query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, id_op_origen)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_partistock`,
      [op.id_prod, input.cantReal, input.fechaFab, input.lote, input.idOp]
    );
    const idPartida = partidaResult.rows[0].id_partistock;

    // Regla clave del spec: nunca validar cant_subprod contra el restante calculado.
    // El pesaje real nunca es exacto — se registra igual, y un "restante" negativo
    // en v_stock_semi_vivo queda como señal a revisar, no como bloqueo.
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
       SET estado = 'finalizada', cant_real = $2, fecha_real = $3, ts_fin = now(), user_fin = $4
       WHERE id_op = $1`,
      [input.idOp, input.cantReal, input.fechaFab, input.userFin]
    );

    return { idPartida };
  });
}

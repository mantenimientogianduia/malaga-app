import { query } from "../db";

export interface SaborParaQuiebre {
  idProd: number;
  detalle: string;
  tieneBachasPendientes: boolean;
}

export async function listSaboresParaQuiebre(): Promise<SaborParaQuiebre[]> {
  const result = await query<{ id_prod: number; detalle: string; tiene_bachas_pendientes: boolean }>(
    `SELECT p.id_prod, p.detalle,
            EXISTS (
              SELECT 1 FROM malaga.f_partidas_stock ps
              WHERE ps.id_prod = p.id_prod AND ps.ts_exhibicion IS NULL
            ) AS tiene_bachas_pendientes
     FROM malaga.d_productos p
     WHERE p.tipo_producto = 'PT' AND p.activo = true
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    tieneBachasPendientes: r.tiene_bachas_pendientes,
  }));
}

export interface QuiebreAbierto {
  idQuiebre: number;
  idProd: number;
  productoDetalle: string;
  tsCarga: string;
  tsQuiebreReal: string;
  userCarga: string | null;
}

function mapQuiebreAbierto(row: {
  id_quiebre: number;
  id_prod: number;
  producto_detalle: string;
  ts_carga: string;
  ts_quiebre_real: string;
  user_carga: string | null;
}): QuiebreAbierto {
  return {
    idQuiebre: row.id_quiebre,
    idProd: row.id_prod,
    productoDetalle: row.producto_detalle,
    tsCarga: row.ts_carga,
    tsQuiebreReal: row.ts_quiebre_real,
    userCarga: row.user_carga,
  };
}

export async function getQuiebreAbiertoPorProducto(idProd: number): Promise<QuiebreAbierto | null> {
  const result = await query<{
    id_quiebre: number;
    id_prod: number;
    producto_detalle: string;
    ts_carga: string;
    ts_quiebre_real: string;
    user_carga: string | null;
  }>(
    `SELECT q.id_quiebre, q.id_prod, p.detalle AS producto_detalle,
            q.ts_carga::text AS ts_carga, q.ts_quiebre_real::text AS ts_quiebre_real,
            u.email AS user_carga
     FROM malaga.f_quiebres q
     JOIN malaga.d_productos p ON p.id_prod = q.id_prod
     LEFT JOIN malaga.usuarios u ON u.id_user = q.user_carga
     WHERE q.id_prod = $1 AND q.ts_repuesto IS NULL`,
    [idProd]
  );
  const row = result.rows[0];
  return row ? mapQuiebreAbierto(row) : null;
}

export async function crearQuiebre(
  idProd: number,
  tsQuiebreReal: string,
  userCarga: number
): Promise<{ idQuiebre: number }> {
  const existente = await getQuiebreAbiertoPorProducto(idProd);
  if (existente) {
    throw new Error("Ya hay un quiebre abierto para este sabor.");
  }

  const result = await query<{ id_quiebre: number }>(
    `INSERT INTO malaga.f_quiebres (id_prod, ts_quiebre_real, user_carga)
     VALUES ($1, $2, $3) RETURNING id_quiebre`,
    [idProd, tsQuiebreReal, userCarga]
  );
  return { idQuiebre: result.rows[0].id_quiebre };
}

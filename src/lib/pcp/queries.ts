import { query } from "../db";

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

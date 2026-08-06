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

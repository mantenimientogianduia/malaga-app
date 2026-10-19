import { query } from "../db";

export interface ConfigPcp {
  margenPct: number;
  diasCobertura: number;
}

export async function getConfigPcp(): Promise<ConfigPcp> {
  const result = await query<{ margen_pct: string; dias_cobertura: string }>(
    `SELECT margen_pct, dias_cobertura FROM malaga.pcp_config WHERE id = 1`
  );
  const row = result.rows[0];
  return { margenPct: Number(row.margen_pct), diasCobertura: Number(row.dias_cobertura) };
}

export async function updateConfigPcp(margenPct: number, diasCobertura: number): Promise<void> {
  await query(`UPDATE malaga.pcp_config SET margen_pct = $1, dias_cobertura = $2 WHERE id = 1`, [
    margenPct,
    diasCobertura,
  ]);
}

export interface DemandaBaseFila {
  idProd: number;
  detalle: string;
  kgDia: number;
}

// Sabores en cartilla o programados a entrar, con sus kg/día (0 si todavía no se cargó).
export async function listDemandaBase(): Promise<DemandaBaseFila[]> {
  const result = await query<{ id_prod: number; detalle: string; kg_dia: string }>(
    `SELECT p.id_prod, p.detalle, COALESCE(d.kg_dia, 0) AS kg_dia
     FROM malaga.d_productos p
     LEFT JOIN malaga.pcp_demanda_base d ON d.id_prod = p.id_prod
     WHERE p.id_prod IN (
       SELECT id_prod FROM malaga.d_exhibidora
       UNION
       SELECT id_prod_fut FROM malaga.d_exhibidora WHERE id_prod_fut IS NOT NULL
     )
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, detalle: r.detalle, kgDia: Number(r.kg_dia) }));
}

export async function setDemandaBase(idProd: number, kgDia: number): Promise<void> {
  await query(
    `INSERT INTO malaga.pcp_demanda_base (id_prod, kg_dia) VALUES ($1, $2)
     ON CONFLICT (id_prod) DO UPDATE SET kg_dia = EXCLUDED.kg_dia`,
    [idProd, kgDia]
  );
}

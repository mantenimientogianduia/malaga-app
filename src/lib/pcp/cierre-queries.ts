import { query } from "../db";
import {
  getCoccionesPendientesPorProducto,
  getItemsRecetaSemiPorProducto,
} from "./queries";
import type { SaborCierre } from "./cierre-calc";

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

export interface BachaObrador {
  idPartida: number;
  idProd: number;
  detalle: string;
  lote: string;
  cantidad: number;
}

// Bachas de PT terminadas que todavía no salieron a la exhibidora (y no tienen baja).
export async function listBachasObrador(): Promise<BachaObrador[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    detalle: string;
    lote: string;
    cantidad: string;
  }>(
    `SELECT ps.id_partistock, ps.id_prod, p.detalle, ps.lote, ps.cantidad
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL AND ps.ts_baja_manual IS NULL
     ORDER BY p.detalle, ps.fecha_fab, ps.id_partistock`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    detalle: r.detalle,
    lote: r.lote,
    cantidad: Number(r.cantidad),
  }));
}

export interface BachaExhibida {
  idPartida: number;
  idProd: number;
  detalle: string;
  lote: string;
  cantidad: number;
  nroPosicion: number;
}

// La bacha actualmente exhibida en cada posición (la última partida exhibida del slot).
export async function listBachasExhibidas(): Promise<BachaExhibida[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    detalle: string;
    lote: string;
    cantidad: string;
    nro: number;
  }>(
    `SELECT v.id_partistock, v.id_prod, p.detalle, v.lote, v.cantidad, e.nro
     FROM malaga.v_stock_pt_vivo v
     JOIN malaga.d_productos p ON p.id_prod = v.id_prod
     JOIN malaga.d_exhibidora e ON e.id_exhibidora = v.id_exhibidora
     ORDER BY e.nro`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    detalle: r.detalle,
    lote: r.lote,
    cantidad: Number(r.cantidad),
    nroPosicion: r.nro,
  }));
}

export interface BaseTeorica {
  idProd: number;
  detalle: string;
  loteOptimo: number | null;
  loteMinimo: number | null;
  stockTeorico: number;
}

// Stock teórico de cada base activa (SEMI).
// Con cierre previo: real del último cierre + producido - consumido - bajas desde entonces.
// Sin cierre previo: suma del restante por lotes (v_stock_semi_vivo).
// El consumo se toma de f_trazabilidad_op por base (id_subprod) y no por lote, porque
// una OP puede finalizarse sin haber elegido el lote consumido.
export async function getStockTeoricoBases(): Promise<BaseTeorica[]> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    lote_optimo: string | null;
    lote_minimo: string | null;
    teorico: string;
  }>(
    `WITH ultimo AS (
       SELECT DISTINCT ON (b.id_prod) b.id_prod, b.stock_real, c.ts_cierre
       FROM malaga.f_cierre_dia_base b
       JOIN malaga.f_cierre_dia c ON c.id_cierre = b.id_cierre
       ORDER BY b.id_prod, c.ts_cierre DESC, c.id_cierre DESC
     )
     SELECT p.id_prod, p.detalle, p.lote_optimo, p.lote_minimo,
       CASE WHEN u.id_prod IS NULL THEN
         COALESCE((SELECT SUM(v.restante) FROM malaga.v_stock_semi_vivo v WHERE v.id_prod = p.id_prod), 0)
       ELSE
         u.stock_real
         + COALESCE((
             SELECT SUM(ps.cantidad) FROM malaga.f_partidas_stock ps
             WHERE ps.id_prod = p.id_prod AND ps.ts_ingreso > u.ts_cierre
           ), 0)
         - COALESCE((
             SELECT SUM(t.cant_subprod)
             FROM malaga.f_trazabilidad_op t
             JOIN malaga.f_ordenes_produccion o ON o.id_op = t.id_op
             WHERE t.id_subprod = p.id_prod AND o.ts_fin > u.ts_cierre
           ), 0)
         - COALESCE((
             SELECT SUM(ps.cantidad - COALESCE(cons.total, 0))
             FROM malaga.f_partidas_stock ps
             LEFT JOIN (
               SELECT id_parti_subprod, SUM(cant_subprod) AS total
               FROM malaga.f_trazabilidad_op
               WHERE id_parti_subprod IS NOT NULL
               GROUP BY id_parti_subprod
             ) cons ON cons.id_parti_subprod = ps.id_partistock
             WHERE ps.id_prod = p.id_prod AND ps.ts_baja_manual > u.ts_cierre
           ), 0)
       END AS teorico
     FROM malaga.d_productos p
     LEFT JOIN ultimo u ON u.id_prod = p.id_prod
     WHERE p.tipo_producto = 'SEMI' AND p.activo = true
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    loteOptimo: r.lote_optimo === null ? null : Number(r.lote_optimo),
    loteMinimo: r.lote_minimo === null ? null : Number(r.lote_minimo),
    stockTeorico: Number(r.teorico),
  }));
}

export interface BaseDatos extends BaseTeorica {
  coccionesPendientes: number;
}

export interface DatosCierre {
  margenPct: number;
  diasCobertura: number;
  sabores: SaborCierre[];
  bachasObrador: BachaObrador[];
  bachasExhibidas: BachaExhibida[];
  bases: BaseDatos[];
}

// Todo lo que necesita la pantalla de cierre. Es serializable (se pasa a un componente cliente).
export async function getDatosCierre(): Promise<DatosCierre> {
  const config = await getConfigPcp();
  const demanda = await listDemandaBase();
  const idsSabores = demanda.map((d) => d.idProd);

  const pesosResult = await query<{ id_prod: number; peso_estandar: string | null }>(
    `SELECT id_prod, peso_estandar FROM malaga.d_productos WHERE id_prod = ANY($1::int[])`,
    [idsSabores]
  );
  const pesos = new Map(
    pesosResult.rows.map((r) => [r.id_prod, r.peso_estandar === null ? null : Number(r.peso_estandar)])
  );

  const itemsPorSabor = await getItemsRecetaSemiPorProducto(idsSabores);
  const pendientes = await getCoccionesPendientesPorProducto();
  const bachasObrador = await listBachasObrador();
  const bachasExhibidas = await listBachasExhibidas();
  const bases = await getStockTeoricoBases();

  const sabores: SaborCierre[] = demanda.map((d) => ({
    idProd: d.idProd,
    detalle: d.detalle,
    pesoEstandar: pesos.get(d.idProd) ?? null,
    demandaBaseKgDia: d.kgDia,
    coccionesPendientes: pendientes.get(d.idProd) ?? 0,
    items: (itemsPorSabor.get(d.idProd) ?? []).map((i) => ({
      idSubprod: i.idSubprod,
      cantSubprod: Number(i.cantSubprod),
    })),
  }));

  return {
    margenPct: config.margenPct,
    diasCobertura: config.diasCobertura,
    sabores,
    bachasObrador,
    bachasExhibidas,
    bases: bases.map((b) => ({ ...b, coccionesPendientes: pendientes.get(b.idProd) ?? 0 })),
  };
}

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.d_productos
      ADD COLUMN stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
      ADD COLUMN lote_optimo NUMERIC(12,3),
      ADD COLUMN lote_minimo NUMERIC(12,3);

    UPDATE malaga.d_productos p
    SET stock_minimo = e.cantidad_minima
    FROM malaga.d_exhibidora e
    WHERE e.id_prod = p.id_prod;

    DROP VIEW malaga.v_planificacion_diaria;

    ALTER TABLE malaga.d_exhibidora DROP COLUMN cantidad_minima;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.d_exhibidora ADD COLUMN cantidad_minima NUMERIC(12,3) NOT NULL DEFAULT 0;

    UPDATE malaga.d_exhibidora e
    SET cantidad_minima = p.stock_minimo
    FROM malaga.d_productos p
    WHERE p.id_prod = e.id_prod;

    CREATE VIEW malaga.v_planificacion_diaria AS
    SELECT
      base.id_exhibidora, base.nro, base.sucursal, base.id_prod, base.producto_detalle,
      base.peso_estandar, base.cantidad_minima, base.stock_actual, base.faltante,
      CASE WHEN base.faltante > 0 THEN CEIL(base.faltante / base.peso_estandar) ELSE 0 END AS bachas_sugeridas,
      CASE WHEN base.faltante > 0 THEN CEIL(base.faltante / base.peso_estandar) * base.peso_estandar ELSE 0 END AS cantidad_sugerida
    FROM (
      SELECT
        e.id_exhibidora, e.nro, e.sucursal, e.id_prod, p.detalle AS producto_detalle, p.peso_estandar,
        e.cantidad_minima, COALESCE(SUM(v.cantidad), 0) AS stock_actual,
        e.cantidad_minima - COALESCE(SUM(v.cantidad), 0) AS faltante
      FROM malaga.d_exhibidora e
      JOIN malaga.d_productos p ON p.id_prod = e.id_prod
      LEFT JOIN malaga.v_stock_pt_vivo v ON v.id_prod = e.id_prod AND v.id_exhibidora = e.id_exhibidora
      GROUP BY e.id_exhibidora, e.nro, e.sucursal, e.id_prod, p.detalle, p.peso_estandar, e.cantidad_minima
    ) base;

    ALTER TABLE malaga.d_productos
      DROP COLUMN lote_minimo,
      DROP COLUMN lote_optimo,
      DROP COLUMN stock_minimo;
  `);
};

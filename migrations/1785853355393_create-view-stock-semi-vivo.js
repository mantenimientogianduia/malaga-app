exports.up = (pgm) => {
  pgm.sql(`
    CREATE VIEW malaga.v_stock_semi_vivo AS
    SELECT
      ps.id_partistock,
      ps.id_prod,
      ps.lote,
      ps.cantidad AS cantidad_inicial,
      ps.cantidad - COALESCE(consumo.total_consumido, 0) AS restante,
      ps.ts_ingreso,
      ps.sucursal
    FROM malaga.f_partidas_stock ps
    JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
    LEFT JOIN (
      SELECT id_parti_subprod, SUM(cant_subprod) AS total_consumido
      FROM malaga.f_trazabilidad_op
      GROUP BY id_parti_subprod
    ) consumo ON consumo.id_parti_subprod = ps.id_partistock
    WHERE p.tipo_producto = 'SEMI'
      AND ps.ts_baja_manual IS NULL
      AND (ps.cantidad - COALESCE(consumo.total_consumido, 0)) > 0;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP VIEW malaga.v_stock_semi_vivo;`);
};

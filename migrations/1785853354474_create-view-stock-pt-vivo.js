exports.up = (pgm) => {
  pgm.sql(`
    CREATE VIEW malaga.v_stock_pt_vivo AS
    SELECT ps.*
    FROM malaga.f_partidas_stock ps
    JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
    WHERE p.tipo_producto = 'PT'
      AND ps.ts_exhibicion IS NOT NULL
      AND ps.id_partistock = (
        SELECT ps2.id_partistock
        FROM malaga.f_partidas_stock ps2
        WHERE ps2.id_exhibidora = ps.id_exhibidora
          AND ps2.ts_exhibicion IS NOT NULL
        ORDER BY ps2.ts_exhibicion DESC, ps2.id_partistock DESC
        LIMIT 1
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP VIEW malaga.v_stock_pt_vivo;`);
};

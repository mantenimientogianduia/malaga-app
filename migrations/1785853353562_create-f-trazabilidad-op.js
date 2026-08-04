exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_trazabilidad_op (
      id_traz SERIAL PRIMARY KEY,
      id_op INTEGER NOT NULL REFERENCES malaga.f_ordenes_produccion(id_op),
      id_receta INTEGER NOT NULL REFERENCES malaga.recetas(id_receta),
      id_detalle_receta INTEGER NOT NULL REFERENCES malaga.recetas_detalles(id_det_receta),
      id_subprod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      cant_subprod NUMERIC(12,3) NOT NULL CHECK (cant_subprod > 0),
      lote_subprod TEXT,
      id_parti_subprod INTEGER NOT NULL REFERENCES malaga.f_partidas_stock(id_partistock),
      id_prod_op INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod)
    );

    CREATE INDEX idx_trazabilidad_id_op ON malaga.f_trazabilidad_op(id_op);
    CREATE INDEX idx_trazabilidad_id_parti_subprod ON malaga.f_trazabilidad_op(id_parti_subprod);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_trazabilidad_op;`);
};

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_partidas_stock (
      id_partistock SERIAL PRIMARY KEY,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
      fecha_fab DATE NOT NULL,
      lote TEXT NOT NULL,
      ts_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
      id_op_origen INTEGER UNIQUE REFERENCES malaga.f_ordenes_produccion(id_op),
      ts_exhibicion TIMESTAMPTZ,
      id_exhibidora INTEGER REFERENCES malaga.d_exhibidora(id_exhibidora),
      user_exhibicion INTEGER REFERENCES malaga.usuarios(id_user),
      ts_baja_manual TIMESTAMPTZ,
      motivo_baja_manual TEXT CHECK (motivo_baja_manual IN ('scrap', 'vencido', 'ajuste')),
      user_baja_manual INTEGER REFERENCES malaga.usuarios(id_user),
      sucursal TEXT NOT NULL DEFAULT 'malaga-centro'
    );

    CREATE INDEX idx_partidas_stock_id_prod ON malaga.f_partidas_stock(id_prod);
    CREATE INDEX idx_partidas_stock_id_exhibidora ON malaga.f_partidas_stock(id_exhibidora);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_partidas_stock;`);
};

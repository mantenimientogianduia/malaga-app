exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.d_exhibidora (
      id_exhibidora SERIAL PRIMARY KEY,
      nro INTEGER NOT NULL CHECK (nro BETWEEN 1 AND 24),
      sucursal TEXT NOT NULL DEFAULT 'malaga-centro',
      id_prod INTEGER REFERENCES malaga.d_productos(id_prod),
      id_prod_ant INTEGER REFERENCES malaga.d_productos(id_prod),
      id_prod_fut INTEGER REFERENCES malaga.d_productos(id_prod),
      cantidad_minima NUMERIC(12,3) NOT NULL DEFAULT 0,
      ts_ulticambio TIMESTAMPTZ,
      ts_cambio_programado TIMESTAMPTZ,
      UNIQUE (sucursal, nro)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.d_exhibidora;`);
};

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.pcp_factor_dia_semana (
      dia_semana SMALLINT PRIMARY KEY CHECK (dia_semana BETWEEN 1 AND 7),
      factor NUMERIC(6,3) NOT NULL DEFAULT 1.0
    );
    INSERT INTO malaga.pcp_factor_dia_semana (dia_semana, factor)
      SELECT d, 1.0 FROM generate_series(1, 7) AS d;

    CREATE TABLE malaga.pcp_factor_producto (
      id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
      factor NUMERIC(6,3) NOT NULL DEFAULT 1.0
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.pcp_factor_producto;
    DROP TABLE malaga.pcp_factor_dia_semana;
  `);
};

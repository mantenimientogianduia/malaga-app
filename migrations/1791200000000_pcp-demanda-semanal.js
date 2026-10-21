exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.pcp_config
      ADD COLUMN demanda_semanal_kg NUMERIC(10,2) NOT NULL DEFAULT 550 CHECK (demanda_semanal_kg >= 0);

    CREATE TABLE malaga.pcp_pct_dia (
      dia_semana SMALLINT PRIMARY KEY CHECK (dia_semana BETWEEN 1 AND 7),
      pct NUMERIC(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100)
    );

    INSERT INTO malaga.pcp_pct_dia (dia_semana, pct) VALUES
      (1, 13), (2, 13), (3, 13), (4, 13), (5, 16), (6, 16), (7, 16);

    CREATE TABLE malaga.pcp_pct_sabor (
      id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
      pct NUMERIC(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100)
    );

    DROP TABLE malaga.pcp_demanda_base;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.pcp_demanda_base (
      id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
      kg_dia NUMERIC(12,3) NOT NULL CHECK (kg_dia >= 0)
    );

    DROP TABLE malaga.pcp_pct_sabor;
    DROP TABLE malaga.pcp_pct_dia;
    ALTER TABLE malaga.pcp_config DROP COLUMN demanda_semanal_kg;
  `);
};

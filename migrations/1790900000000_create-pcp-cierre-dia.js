exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.pcp_demanda_base (
      id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
      kg_dia NUMERIC(12,3) NOT NULL CHECK (kg_dia >= 0)
    );

    CREATE TABLE malaga.pcp_config (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      margen_pct NUMERIC(6,2) NOT NULL DEFAULT 20 CHECK (margen_pct >= 0),
      dias_cobertura NUMERIC(6,2) NOT NULL DEFAULT 3 CHECK (dias_cobertura >= 0)
    );

    INSERT INTO malaga.pcp_config (id) VALUES (1);

    CREATE TABLE malaga.f_cierre_dia (
      id_cierre SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      fecha_plan DATE NOT NULL,
      ts_cierre TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_cierre INTEGER NOT NULL REFERENCES malaga.usuarios(id_user),
      margen_pct NUMERIC(6,2) NOT NULL,
      dias_cobertura NUMERIC(6,2) NOT NULL
    );

    CREATE TABLE malaga.f_cierre_dia_bacha (
      id_cierre INTEGER NOT NULL REFERENCES malaga.f_cierre_dia(id_cierre),
      id_partistock INTEGER NOT NULL REFERENCES malaga.f_partidas_stock(id_partistock),
      pct SMALLINT NOT NULL CHECK (pct IN (0, 25, 50, 75, 100)),
      PRIMARY KEY (id_cierre, id_partistock)
    );

    CREATE TABLE malaga.f_cierre_dia_sabor (
      id_cierre INTEGER NOT NULL REFERENCES malaga.f_cierre_dia(id_cierre),
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      demanda NUMERIC(12,3) NOT NULL,
      stock_disponible NUMERIC(12,3) NOT NULL,
      cocciones_pendientes NUMERIC(12,3) NOT NULL,
      necesario NUMERIC(12,3) NOT NULL,
      bachas INTEGER NOT NULL CHECK (bachas >= 0),
      kg_a_fabricar NUMERIC(12,3) NOT NULL,
      id_op_fabricar INTEGER REFERENCES malaga.f_ordenes_produccion(id_op),
      PRIMARY KEY (id_cierre, id_prod)
    );

    CREATE TABLE malaga.f_cierre_dia_base (
      id_cierre INTEGER NOT NULL REFERENCES malaga.f_cierre_dia(id_cierre),
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      stock_teorico NUMERIC(12,3) NOT NULL,
      stock_real NUMERIC(12,3) NOT NULL CHECK (stock_real >= 0),
      descongelar NUMERIC(12,3) NOT NULL,
      faltante NUMERIC(12,3) NOT NULL,
      cocinar NUMERIC(12,3) NOT NULL,
      id_op_cocinar INTEGER REFERENCES malaga.f_ordenes_produccion(id_op),
      PRIMARY KEY (id_cierre, id_prod)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.f_cierre_dia_base;
    DROP TABLE malaga.f_cierre_dia_sabor;
    DROP TABLE malaga.f_cierre_dia_bacha;
    DROP TABLE malaga.f_cierre_dia;
    DROP TABLE malaga.pcp_config;
    DROP TABLE malaga.pcp_demanda_base;
  `);
};

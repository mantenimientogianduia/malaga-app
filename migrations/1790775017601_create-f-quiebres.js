exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_quiebres (
      id_quiebre SERIAL PRIMARY KEY,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      ts_carga TIMESTAMPTZ NOT NULL DEFAULT now(),
      ts_quiebre_real TIMESTAMPTZ NOT NULL,
      user_carga INTEGER NOT NULL REFERENCES malaga.usuarios(id_user),
      ts_repuesto TIMESTAMPTZ,
      id_partida_repuso INTEGER REFERENCES malaga.f_partidas_stock(id_partistock)
    );

    CREATE INDEX idx_quiebres_id_prod ON malaga.f_quiebres(id_prod);
    CREATE INDEX idx_quiebres_abiertos ON malaga.f_quiebres(id_prod) WHERE ts_repuesto IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_quiebres;`);
};

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.sesiones (
      id_sesion SERIAL PRIMARY KEY,
      id_user INTEGER NOT NULL REFERENCES malaga.usuarios(id_user),
      token_hash TEXT NOT NULL UNIQUE,
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      expira TIMESTAMPTZ NOT NULL,
      user_agent TEXT
    );

    CREATE INDEX idx_sesiones_id_user ON malaga.sesiones(id_user);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.sesiones;`);
};

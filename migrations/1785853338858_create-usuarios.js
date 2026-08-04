exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.usuarios (
      id_user SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('produccion', 'gestion', 'admin')),
      activo BOOLEAN NOT NULL DEFAULT true,
      fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.usuarios;`);
};

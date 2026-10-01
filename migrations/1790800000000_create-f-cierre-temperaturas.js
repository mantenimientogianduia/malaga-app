exports.up = (pgm) => {
  pgm.sql(`
    DROP INDEX malaga.idx_registro_temperaturas_punto_fecha;

    ALTER TABLE malaga.f_registro_temperaturas
      ADD CONSTRAINT uq_registro_temperaturas_punto_fecha UNIQUE (id_punto, fecha);

    CREATE TABLE malaga.f_cierre_temperaturas (
      fecha DATE PRIMARY KEY,
      ts_cierre TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_cierre INTEGER NOT NULL REFERENCES malaga.usuarios(id_user)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.f_cierre_temperaturas;

    ALTER TABLE malaga.f_registro_temperaturas
      DROP CONSTRAINT uq_registro_temperaturas_punto_fecha;

    CREATE INDEX idx_registro_temperaturas_punto_fecha ON malaga.f_registro_temperaturas(id_punto, fecha);
  `);
};

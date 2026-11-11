exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.f_registro_temperaturas
      DROP CONSTRAINT uq_registro_temperaturas_punto_fecha,
      ADD COLUMN ts_edicion TIMESTAMPTZ,
      ADD COLUMN user_edicion INTEGER REFERENCES malaga.usuarios(id_user);

    CREATE INDEX idx_registro_temperaturas_punto_fecha_ts
      ON malaga.f_registro_temperaturas(id_punto, fecha, ts_registro DESC);
  `);
};

// Volver a la restricción única falla si ya hay más de una medición por punto y día.
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX malaga.idx_registro_temperaturas_punto_fecha_ts;

    ALTER TABLE malaga.f_registro_temperaturas
      DROP COLUMN user_edicion,
      DROP COLUMN ts_edicion,
      ADD CONSTRAINT uq_registro_temperaturas_punto_fecha UNIQUE (id_punto, fecha);
  `);
};

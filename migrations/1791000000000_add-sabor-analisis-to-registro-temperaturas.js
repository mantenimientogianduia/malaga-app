exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.f_registro_temperaturas
      ADD COLUMN id_prod INTEGER REFERENCES malaga.d_productos(id_prod),
      ADD COLUMN analisis_ok BOOLEAN,
      ADD COLUMN observacion TEXT,
      ADD CONSTRAINT chk_registro_temperaturas_observacion
        CHECK (analisis_ok IS DISTINCT FROM false OR COALESCE(length(btrim(observacion)), 0) > 0);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.f_registro_temperaturas
      DROP CONSTRAINT chk_registro_temperaturas_observacion,
      DROP COLUMN observacion,
      DROP COLUMN analisis_ok,
      DROP COLUMN id_prod;
  `);
};

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.f_ordenes_produccion ALTER COLUMN id_receta DROP NOT NULL;
    ALTER TABLE malaga.f_trazabilidad_op ALTER COLUMN id_parti_subprod DROP NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.f_trazabilidad_op ALTER COLUMN id_parti_subprod SET NOT NULL;
    ALTER TABLE malaga.f_ordenes_produccion ALTER COLUMN id_receta SET NOT NULL;
  `);
};

exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE malaga.f_partidas_stock ADD COLUMN obs_baja_manual TEXT;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE malaga.f_partidas_stock DROP COLUMN obs_baja_manual;`);
};

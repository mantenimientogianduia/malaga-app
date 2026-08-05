exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.d_productos ADD COLUMN codigo TEXT UNIQUE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE malaga.d_productos DROP COLUMN codigo;`);
};

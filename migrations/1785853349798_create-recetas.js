exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.recetas (
      id_receta SERIAL PRIMARY KEY,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      version INTEGER NOT NULL,
      activa BOOLEAN NOT NULL DEFAULT true,
      fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_alta INTEGER REFERENCES malaga.usuarios(id_user),
      UNIQUE (id_prod, version)
    );

    CREATE TABLE malaga.recetas_detalles (
      id_det_receta SERIAL PRIMARY KEY,
      id_receta INTEGER NOT NULL REFERENCES malaga.recetas(id_receta),
      id_prod_padre INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      id_subprod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      cant_subprod NUMERIC(12,3) NOT NULL CHECK (cant_subprod > 0)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.recetas_detalles;
    DROP TABLE malaga.recetas;
  `);
};

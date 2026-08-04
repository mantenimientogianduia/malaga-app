exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_ordenes_produccion (
      id_op SERIAL PRIMARY KEY,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      id_receta INTEGER NOT NULL REFERENCES malaga.recetas(id_receta),
      cant_plan NUMERIC(12,3) NOT NULL CHECK (cant_plan > 0),
      cant_real NUMERIC(12,3),
      fecha_plan DATE NOT NULL,
      fecha_real DATE,
      ts_ini TIMESTAMPTZ,
      ts_fin TIMESTAMPTZ,
      user_ini INTEGER REFERENCES malaga.usuarios(id_user),
      user_fin INTEGER REFERENCES malaga.usuarios(id_user),
      estado TEXT NOT NULL DEFAULT 'planificada'
        CHECK (estado IN ('planificada', 'en_proceso', 'finalizada', 'cancelada')),
      obs TEXT
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_ordenes_produccion;`);
};

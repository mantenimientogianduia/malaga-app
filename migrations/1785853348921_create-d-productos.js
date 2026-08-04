exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.d_productos (
      id_prod SERIAL PRIMARY KEY,
      detalle TEXT NOT NULL,
      sector TEXT,
      familia TEXT,
      unid_med TEXT NOT NULL,
      tipo_producto TEXT NOT NULL CHECK (tipo_producto IN ('PT', 'SEMI')),
      peso_estandar NUMERIC(12,3) CHECK (peso_estandar IS NULL OR peso_estandar > 0),
      activo BOOLEAN NOT NULL DEFAULT true,
      CONSTRAINT peso_estandar_obligatorio_pt
        CHECK (tipo_producto <> 'PT' OR peso_estandar IS NOT NULL)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.d_productos;`);
};

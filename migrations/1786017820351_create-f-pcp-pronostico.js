exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_pcp_pronostico (
      id_pronostico SERIAL PRIMARY KEY,
      fecha_plan DATE NOT NULL,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      demanda_pronosticada NUMERIC(12,3) NOT NULL,
      stock_actual_momento NUMERIC(12,3) NOT NULL,
      stock_minimo_momento NUMERIC(12,3) NOT NULL,
      cocciones_pendientes_momento NUMERIC(12,3) NOT NULL,
      necesario NUMERIC(12,3) NOT NULL,
      cantidad_planificada NUMERIC(12,3) NOT NULL,
      factor_puntual_semana NUMERIC(6,3),
      id_op_generada INTEGER REFERENCES malaga.f_ordenes_produccion(id_op),
      ts_generado TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_generado INTEGER REFERENCES malaga.usuarios(id_user)
    );

    CREATE INDEX idx_pcp_pronostico_fecha_plan ON malaga.f_pcp_pronostico(fecha_plan);
    CREATE INDEX idx_pcp_pronostico_id_prod ON malaga.f_pcp_pronostico(id_prod);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_pcp_pronostico;`);
};

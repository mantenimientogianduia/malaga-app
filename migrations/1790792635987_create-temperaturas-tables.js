exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.d_puntos_temperatura (
      id_punto SERIAL PRIMARY KEY,
      exhibidora SMALLINT NOT NULL CHECK (exhibidora IN (1, 2)),
      lado TEXT NOT NULL CHECK (lado IN ('obrador', 'cliente')),
      posicion TEXT NOT NULL CHECK (posicion IN ('izquierda', 'derecha')),
      detalle TEXT NOT NULL
    );

    INSERT INTO malaga.d_puntos_temperatura (exhibidora, lado, posicion, detalle) VALUES
      (1, 'obrador', 'izquierda', 'Exhibidora 1 · Obrador · Izquierda'),
      (1, 'obrador', 'derecha', 'Exhibidora 1 · Obrador · Derecha'),
      (1, 'cliente', 'izquierda', 'Exhibidora 1 · Lado Cliente · Izquierda'),
      (1, 'cliente', 'derecha', 'Exhibidora 1 · Lado Cliente · Derecha'),
      (2, 'obrador', 'izquierda', 'Exhibidora 2 · Obrador · Izquierda'),
      (2, 'obrador', 'derecha', 'Exhibidora 2 · Obrador · Derecha'),
      (2, 'cliente', 'izquierda', 'Exhibidora 2 · Lado Cliente · Izquierda'),
      (2, 'cliente', 'derecha', 'Exhibidora 2 · Lado Cliente · Derecha');

    CREATE TABLE malaga.config_temperaturas (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      temp_min NUMERIC(4,1) NOT NULL,
      temp_max NUMERIC(4,1) NOT NULL
    );

    INSERT INTO malaga.config_temperaturas (id, temp_min, temp_max) VALUES (1, -14.0, -12.0);

    CREATE TABLE malaga.f_registro_temperaturas (
      id_registro SERIAL PRIMARY KEY,
      id_punto INTEGER NOT NULL REFERENCES malaga.d_puntos_temperatura(id_punto),
      temperatura NUMERIC(4,1) NOT NULL,
      ts_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_registro INTEGER NOT NULL REFERENCES malaga.usuarios(id_user),
      fecha DATE NOT NULL DEFAULT CURRENT_DATE
    );

    CREATE INDEX idx_registro_temperaturas_punto_fecha ON malaga.f_registro_temperaturas(id_punto, fecha);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.f_registro_temperaturas;
    DROP TABLE malaga.config_temperaturas;
    DROP TABLE malaga.d_puntos_temperatura;
  `);
};

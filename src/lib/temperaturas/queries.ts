import { query } from "../db";

export interface PuntoTemperatura {
  idPunto: number;
  exhibidora: number;
  lado: "obrador" | "cliente";
  posicion: "izquierda" | "derecha";
  detalle: string;
}

function mapPunto(row: {
  id_punto: number;
  exhibidora: number;
  lado: "obrador" | "cliente";
  posicion: "izquierda" | "derecha";
  detalle: string;
}): PuntoTemperatura {
  return {
    idPunto: row.id_punto,
    exhibidora: row.exhibidora,
    lado: row.lado,
    posicion: row.posicion,
    detalle: row.detalle,
  };
}

export async function listPuntos(): Promise<PuntoTemperatura[]> {
  const result = await query<{
    id_punto: number;
    exhibidora: number;
    lado: "obrador" | "cliente";
    posicion: "izquierda" | "derecha";
    detalle: string;
  }>(
    `SELECT id_punto, exhibidora, lado, posicion, detalle
     FROM malaga.d_puntos_temperatura
     ORDER BY exhibidora, lado, posicion`
  );
  return result.rows.map(mapPunto);
}

export interface ConfigTemperaturas {
  tempMin: string;
  tempMax: string;
}

export async function getConfigTemperaturas(): Promise<ConfigTemperaturas> {
  const result = await query<{ temp_min: string; temp_max: string }>(
    `SELECT temp_min, temp_max FROM malaga.config_temperaturas WHERE id = 1`
  );
  const row = result.rows[0];
  return { tempMin: row.temp_min, tempMax: row.temp_max };
}

export async function updateConfigTemperaturas(tempMin: number, tempMax: number): Promise<void> {
  await query(`UPDATE malaga.config_temperaturas SET temp_min = $1, temp_max = $2 WHERE id = 1`, [
    tempMin,
    tempMax,
  ]);
}

export interface PuntoConEstadoHoy extends PuntoTemperatura {
  registradoHoy: boolean;
  temperaturaHoy: string | null;
  fueraDeRangoHoy: boolean | null;
}

export async function listPuntosConEstadoHoy(): Promise<PuntoConEstadoHoy[]> {
  const config = await getConfigTemperaturas();
  const result = await query<{
    id_punto: number;
    exhibidora: number;
    lado: "obrador" | "cliente";
    posicion: "izquierda" | "derecha";
    detalle: string;
    temperatura: string | null;
  }>(
    `SELECT p.id_punto, p.exhibidora, p.lado, p.posicion, p.detalle, r.temperatura
     FROM malaga.d_puntos_temperatura p
     LEFT JOIN malaga.f_registro_temperaturas r ON r.id_punto = p.id_punto AND r.fecha = CURRENT_DATE
     ORDER BY p.exhibidora, p.lado, p.posicion`
  );
  return result.rows.map((r) => ({
    ...mapPunto(r),
    registradoHoy: r.temperatura !== null,
    temperaturaHoy: r.temperatura,
    fueraDeRangoHoy:
      r.temperatura !== null
        ? Number(r.temperatura) < Number(config.tempMin) || Number(r.temperatura) > Number(config.tempMax)
        : null,
  }));
}

export async function registrarTemperatura(
  idPunto: number,
  temperatura: number,
  userRegistro: number
): Promise<{ idRegistro: number }> {
  const existente = await query<{ id_registro: number }>(
    `SELECT id_registro FROM malaga.f_registro_temperaturas WHERE id_punto = $1 AND fecha = CURRENT_DATE`,
    [idPunto]
  );
  if (existente.rows.length > 0) {
    throw new Error("Ya se registró la temperatura de este punto hoy.");
  }

  const result = await query<{ id_registro: number }>(
    `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro)
     VALUES ($1, $2, $3) RETURNING id_registro`,
    [idPunto, temperatura, userRegistro]
  );
  return { idRegistro: result.rows[0].id_registro };
}

export interface RegistroTemperatura {
  idRegistro: number;
  puntoDetalle: string;
  temperatura: string;
  tsRegistro: string;
  userRegistro: string | null;
  fueraDeRango: boolean;
}

export async function listHistorialReciente(limite = 40): Promise<RegistroTemperatura[]> {
  const config = await getConfigTemperaturas();
  const result = await query<{
    id_registro: number;
    punto_detalle: string;
    temperatura: string;
    ts_registro: string;
    user_registro: string | null;
  }>(
    `SELECT r.id_registro, p.detalle AS punto_detalle, r.temperatura,
            r.ts_registro::text AS ts_registro, u.email AS user_registro
     FROM malaga.f_registro_temperaturas r
     JOIN malaga.d_puntos_temperatura p ON p.id_punto = r.id_punto
     LEFT JOIN malaga.usuarios u ON u.id_user = r.user_registro
     ORDER BY r.ts_registro DESC
     LIMIT $1`,
    [limite]
  );
  return result.rows.map((r) => ({
    idRegistro: r.id_registro,
    puntoDetalle: r.punto_detalle,
    temperatura: r.temperatura,
    tsRegistro: r.ts_registro,
    userRegistro: r.user_registro,
    fueraDeRango:
      Number(r.temperatura) < Number(config.tempMin) || Number(r.temperatura) > Number(config.tempMax),
  }));
}

export interface ResumenPunto {
  idPunto: number;
  puntoDetalle: string;
  promedio: number;
  desvios: number;
}

export async function getResumen30Dias(): Promise<ResumenPunto[]> {
  const config = await getConfigTemperaturas();
  const result = await query<{
    id_punto: number;
    punto_detalle: string;
    promedio: string;
    desvios: string;
  }>(
    `SELECT p.id_punto, p.detalle AS punto_detalle, AVG(r.temperatura) AS promedio,
            COUNT(*) FILTER (WHERE r.temperatura < $1 OR r.temperatura > $2) AS desvios
     FROM malaga.d_puntos_temperatura p
     JOIN malaga.f_registro_temperaturas r ON r.id_punto = p.id_punto
     WHERE r.ts_registro >= now() - interval '30 days'
     GROUP BY p.id_punto, p.detalle
     ORDER BY p.detalle`,
    [config.tempMin, config.tempMax]
  );
  return result.rows.map((r) => ({
    idPunto: r.id_punto,
    puntoDetalle: r.punto_detalle,
    promedio: Number(r.promedio),
    desvios: Number(r.desvios),
  }));
}

export async function deshacerRegistroTemperatura(idRegistro: number): Promise<void> {
  await query(`DELETE FROM malaga.f_registro_temperaturas WHERE id_registro = $1`, [idRegistro]);
}

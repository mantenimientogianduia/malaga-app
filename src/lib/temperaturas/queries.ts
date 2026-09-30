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

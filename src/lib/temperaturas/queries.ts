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

export interface SaborExhibido {
  idProd: number;
  nroPosicion: number;
  detalle: string;
}

// Sabores de la cartilla actual, ordenados por posición en la exhibidora.
export async function listSaboresExhibidos(): Promise<SaborExhibido[]> {
  const result = await query<{ id_prod: number; nro: number; detalle: string }>(
    `SELECT p.id_prod, e.nro, p.detalle
     FROM malaga.d_exhibidora e
     JOIN malaga.d_productos p ON p.id_prod = e.id_prod
     ORDER BY e.nro`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, nroPosicion: r.nro, detalle: r.detalle }));
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
  // Última medición del día (la más reciente por hora de registro).
  temperaturaHoy: string | null;
  fueraDeRangoHoy: boolean | null;
  idProdHoy: number | null;
  saborHoy: string | null;
  analisisOkHoy: boolean | null;
  observacionHoy: string | null;
  medicionesHoy: number;
  // true si alguna medición de hoy (no solo la última) tuvo análisis No OK.
  hayNoOkHoy: boolean;
}

export async function listPuntosConEstadoHoy(config: ConfigTemperaturas): Promise<PuntoConEstadoHoy[]> {
  const result = await query<{
    id_punto: number;
    exhibidora: number;
    lado: "obrador" | "cliente";
    posicion: "izquierda" | "derecha";
    detalle: string;
    temperatura: string | null;
    id_prod: number | null;
    sabor_detalle: string | null;
    analisis_ok: boolean | null;
    observacion: string | null;
    mediciones: number;
    hay_no_ok: boolean | null;
  }>(
    `SELECT p.id_punto, p.exhibidora, p.lado, p.posicion, p.detalle, r.temperatura,
            r.id_prod, s.detalle AS sabor_detalle, r.analisis_ok, r.observacion,
            c.mediciones, c.hay_no_ok
     FROM malaga.d_puntos_temperatura p
     LEFT JOIN LATERAL (
       SELECT * FROM malaga.f_registro_temperaturas
       WHERE id_punto = p.id_punto AND fecha = CURRENT_DATE
       ORDER BY ts_registro DESC, id_registro DESC
       LIMIT 1
     ) r ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS mediciones, bool_or(analisis_ok = false) AS hay_no_ok
       FROM malaga.f_registro_temperaturas
       WHERE id_punto = p.id_punto AND fecha = CURRENT_DATE
     ) c ON true
     LEFT JOIN malaga.d_productos s ON s.id_prod = r.id_prod
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
    idProdHoy: r.id_prod,
    saborHoy: r.sabor_detalle,
    analisisOkHoy: r.analisis_ok,
    observacionHoy: r.observacion,
    medicionesHoy: r.mediciones,
    hayNoOkHoy: r.hay_no_ok ?? false,
  }));
}

export interface MedicionHoy {
  idRegistro: number;
  idPunto: number;
  temperatura: string;
  tsRegistro: string;
  userRegistro: string | null;
  idProd: number | null;
  saborDetalle: string | null;
  analisisOk: boolean | null;
  observacion: string | null;
  tsEdicion: string | null;
  userEdicion: string | null;
  fueraDeRango: boolean;
}

// Todas las mediciones de hoy, la más reciente primero.
export async function listMedicionesHoy(config: ConfigTemperaturas): Promise<MedicionHoy[]> {
  const result = await query<{
    id_registro: number;
    id_punto: number;
    temperatura: string;
    ts_registro: string;
    user_registro: string | null;
    id_prod: number | null;
    sabor_detalle: string | null;
    analisis_ok: boolean | null;
    observacion: string | null;
    ts_edicion: string | null;
    user_edicion: string | null;
  }>(
    `SELECT r.id_registro, r.id_punto, r.temperatura, r.ts_registro::text AS ts_registro,
            u.email AS user_registro, r.id_prod, s.detalle AS sabor_detalle,
            r.analisis_ok, r.observacion, r.ts_edicion::text AS ts_edicion, ue.email AS user_edicion
     FROM malaga.f_registro_temperaturas r
     LEFT JOIN malaga.usuarios u ON u.id_user = r.user_registro
     LEFT JOIN malaga.usuarios ue ON ue.id_user = r.user_edicion
     LEFT JOIN malaga.d_productos s ON s.id_prod = r.id_prod
     WHERE r.fecha = CURRENT_DATE
     ORDER BY r.ts_registro DESC, r.id_registro DESC`
  );
  return result.rows.map((r) => ({
    idRegistro: r.id_registro,
    idPunto: r.id_punto,
    temperatura: r.temperatura,
    tsRegistro: r.ts_registro,
    userRegistro: r.user_registro,
    idProd: r.id_prod,
    saborDetalle: r.sabor_detalle,
    analisisOk: r.analisis_ok,
    observacion: r.observacion,
    tsEdicion: r.ts_edicion,
    userEdicion: r.user_edicion,
    fueraDeRango:
      Number(r.temperatura) < Number(config.tempMin) || Number(r.temperatura) > Number(config.tempMax),
  }));
}

export interface DetalleRegistro {
  idProd: number;
  analisisOk: boolean;
  observacion: string | null;
}

// Valida los datos de una medición y devuelve la observación ya recortada
// (null si el análisis es OK).
function validarMedicion(temperatura: number, detalle: DetalleRegistro): string | null {
  if (!Number.isFinite(temperatura) || temperatura < -99.9 || temperatura > 99.9) {
    throw new Error("La temperatura tiene que ser un número entre -99,9 y 99,9 °C.");
  }
  if (!Number.isInteger(detalle.idProd) || detalle.idProd <= 0) {
    throw new Error("Elegí el sabor que medís.");
  }
  if (typeof detalle.analisisOk !== "boolean") {
    throw new Error("Indicá el análisis sensorial/visual: OK o No OK.");
  }
  const observacion = (detalle.observacion ?? "").trim();
  if (!detalle.analisisOk && observacion === "") {
    throw new Error("Escribí la observación del análisis No OK.");
  }
  return detalle.analisisOk ? null : observacion;
}

async function validarSaborEnCartilla(idProd: number): Promise<void> {
  const enCartilla = await query(`SELECT 1 FROM malaga.d_exhibidora WHERE id_prod = $1 LIMIT 1`, [idProd]);
  if (enCartilla.rows.length === 0) {
    throw new Error("Ese sabor no está en la cartilla actual.");
  }
}

// Agrega una medición nueva del día: se pueden cargar todas las que hagan falta.
export async function registrarTemperatura(
  idPunto: number,
  temperatura: number,
  userRegistro: number,
  detalle: DetalleRegistro
): Promise<{ idRegistro: number }> {
  const observacion = validarMedicion(temperatura, detalle);

  const cierre = await query(`SELECT 1 FROM malaga.f_cierre_temperaturas WHERE fecha = CURRENT_DATE`);
  if (cierre.rows.length > 0) {
    throw new Error("El día ya está cerrado y firmado. Reabrilo para poder cargar o editar.");
  }

  await validarSaborEnCartilla(detalle.idProd);

  const result = await query<{ id_registro: number }>(
    `INSERT INTO malaga.f_registro_temperaturas
       (id_punto, temperatura, user_registro, id_prod, analisis_ok, observacion)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id_registro`,
    [idPunto, temperatura, userRegistro, detalle.idProd, detalle.analisisOk, observacion]
  );
  return { idRegistro: result.rows[0].id_registro };
}

// Corrige una medición de hoy mientras el día esté abierto. Conserva la hora y el
// usuario de la carga original y deja constancia de quién la editó y cuándo.
export async function editarTemperatura(
  idRegistro: number,
  temperatura: number,
  userEdicion: number,
  detalle: DetalleRegistro
): Promise<void> {
  const observacion = validarMedicion(temperatura, detalle);

  const registro = await query<{ es_hoy: boolean }>(
    `SELECT fecha = CURRENT_DATE AS es_hoy FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
    [idRegistro]
  );
  if (registro.rows.length === 0) {
    throw new Error("Esa medición ya no existe.");
  }
  if (!registro.rows[0].es_hoy) {
    throw new Error("Solo se pueden editar las mediciones de hoy.");
  }

  const cierre = await query(`SELECT 1 FROM malaga.f_cierre_temperaturas WHERE fecha = CURRENT_DATE`);
  if (cierre.rows.length > 0) {
    throw new Error("El día ya está cerrado y firmado. Reabrilo para poder cargar o editar.");
  }

  await validarSaborEnCartilla(detalle.idProd);

  await query(
    `UPDATE malaga.f_registro_temperaturas
     SET temperatura = $2, id_prod = $3, analisis_ok = $4, observacion = $5,
         ts_edicion = now(), user_edicion = $6
     WHERE id_registro = $1`,
    [idRegistro, temperatura, detalle.idProd, detalle.analisisOk, observacion, userEdicion]
  );
}

export interface RegistroTemperatura {
  idRegistro: number;
  puntoDetalle: string;
  temperatura: string;
  tsRegistro: string;
  userRegistro: string | null;
  fueraDeRango: boolean;
  saborDetalle: string | null;
  analisisOk: boolean | null;
  observacion: string | null;
}

export async function listHistorialReciente(
  config: ConfigTemperaturas,
  limite = 40
): Promise<RegistroTemperatura[]> {
  const result = await query<{
    id_registro: number;
    punto_detalle: string;
    temperatura: string;
    ts_registro: string;
    user_registro: string | null;
    sabor_detalle: string | null;
    analisis_ok: boolean | null;
    observacion: string | null;
  }>(
    `SELECT r.id_registro, p.detalle AS punto_detalle, r.temperatura,
            r.ts_registro::text AS ts_registro, u.email AS user_registro,
            s.detalle AS sabor_detalle, r.analisis_ok, r.observacion
     FROM malaga.f_registro_temperaturas r
     JOIN malaga.d_puntos_temperatura p ON p.id_punto = r.id_punto
     LEFT JOIN malaga.usuarios u ON u.id_user = r.user_registro
     LEFT JOIN malaga.d_productos s ON s.id_prod = r.id_prod
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
    saborDetalle: r.sabor_detalle,
    analisisOk: r.analisis_ok,
    observacion: r.observacion,
  }));
}

export interface ResumenPunto {
  idPunto: number;
  puntoDetalle: string;
  promedio: number;
  desvios: number;
}

export async function getResumen30Dias(config: ConfigTemperaturas): Promise<ResumenPunto[]> {
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
  const registro = await query<{ fecha: string }>(
    `SELECT fecha::text AS fecha FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
    [idRegistro]
  );
  const fecha = registro.rows[0]?.fecha;
  if (fecha) {
    const cierre = await query(`SELECT 1 FROM malaga.f_cierre_temperaturas WHERE fecha = $1`, [fecha]);
    if (cierre.rows.length > 0) {
      throw new Error("No se puede deshacer: el día de ese registro está cerrado y firmado.");
    }
  }
  await query(`DELETE FROM malaga.f_registro_temperaturas WHERE id_registro = $1`, [idRegistro]);
}

export interface CierreTemperaturas {
  fecha: string;
  tsCierre: string;
  userCierre: string;
}

export async function getCierreHoy(): Promise<CierreTemperaturas | null> {
  const result = await query<{ fecha: string; ts_cierre: string; user_cierre: string }>(
    `SELECT c.fecha::text AS fecha, c.ts_cierre::text AS ts_cierre, u.email AS user_cierre
     FROM malaga.f_cierre_temperaturas c
     JOIN malaga.usuarios u ON u.id_user = c.user_cierre
     WHERE c.fecha = CURRENT_DATE`
  );
  const row = result.rows[0];
  if (!row) return null;
  return { fecha: row.fecha, tsCierre: row.ts_cierre, userCierre: row.user_cierre };
}

export async function cerrarDia(userCierre: number): Promise<void> {
  await query(
    `INSERT INTO malaga.f_cierre_temperaturas (fecha, user_cierre) VALUES (CURRENT_DATE, $1)
     ON CONFLICT (fecha) DO NOTHING`,
    [userCierre]
  );
}

export async function reabrirDia(): Promise<void> {
  await query(`DELETE FROM malaga.f_cierre_temperaturas WHERE fecha = CURRENT_DATE`);
}

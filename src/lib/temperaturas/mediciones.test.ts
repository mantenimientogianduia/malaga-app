import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { query } from "../db";
import {
  listPuntos,
  getConfigTemperaturas,
  listPuntosConEstadoHoy,
  listMedicionesHoy,
  registrarTemperatura,
  editarTemperatura,
  type DetalleRegistro,
} from "./queries";

// Varias mediciones por punto y día. A diferencia de queries.test.ts, este archivo NO
// hace TRUNCATE: la base es la real y compartida (ya tiene registros cargados por el
// equipo), así que usa sus propios usuarios de prueba, un sabor que ya está en la
// cartilla, mide "antes y después" y al terminar borra solo lo que creó.
const EMAIL_A = "t-med-a@t.com";
const EMAIL_B = "t-med-b@t.com";

describe("temperaturas — varias mediciones por día", () => {
  let idProd: number;
  let userA: number;
  let userB: number;

  beforeAll(async () => {
    const sabor = await query<{ id_prod: number }>(`SELECT id_prod FROM malaga.d_exhibidora ORDER BY nro LIMIT 1`);
    if (sabor.rows.length === 0) throw new Error("Hace falta al menos un sabor en la cartilla para correr estos tests.");
    idProd = sabor.rows[0].id_prod;
  });

  afterEach(async () => {
    await query(
      `DELETE FROM malaga.f_registro_temperaturas
       WHERE user_registro IN (SELECT id_user FROM malaga.usuarios WHERE email IN ($1, $2))
          OR user_edicion IN (SELECT id_user FROM malaga.usuarios WHERE email IN ($1, $2))`,
      [EMAIL_A, EMAIL_B]
    );
    await query(`DELETE FROM malaga.usuarios WHERE email IN ($1, $2)`, [EMAIL_A, EMAIL_B]);
  });

  async function seedUsers() {
    const a = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ($1, 'x', 'produccion') RETURNING id_user`,
      [EMAIL_A]
    );
    const b = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ($1, 'x', 'produccion') RETURNING id_user`,
      [EMAIL_B]
    );
    userA = a.rows[0].id_user;
    userB = b.rows[0].id_user;
  }

  const detalleOk = (): DetalleRegistro => ({ idProd, analisisOk: true, observacion: null });

  async function estadoDelPunto(idPunto: number) {
    const config = await getConfigTemperaturas();
    return (await listPuntosConEstadoHoy(config)).find((p) => p.idPunto === idPunto)!;
  }

  it("permite cargar varias mediciones el mismo día y el punto muestra la última", async () => {
    await seedUsers();
    const [punto] = await listPuntos();
    const antes = await estadoDelPunto(punto.idPunto);

    const primera = await registrarTemperatura(punto.idPunto, -13.5, userA, detalleOk());
    const segunda = await registrarTemperatura(punto.idPunto, -12.5, userA, detalleOk());
    expect(segunda.idRegistro).not.toBe(primera.idRegistro);

    const despues = await estadoDelPunto(punto.idPunto);
    expect(despues.medicionesHoy).toBe(antes.medicionesHoy + 2);
    expect(despues.registradoHoy).toBe(true);
    expect(despues.temperaturaHoy).toBe("-12.5");
  });

  it("marca hayNoOkHoy aunque la última medición esté OK", async () => {
    await seedUsers();
    const [punto] = await listPuntos();

    await registrarTemperatura(punto.idPunto, -9, userA, { idProd, analisisOk: false, observacion: "cristales" });
    await registrarTemperatura(punto.idPunto, -12.5, userA, detalleOk());

    const estado = await estadoDelPunto(punto.idPunto);
    expect(estado.analisisOkHoy).toBe(true);
    expect(estado.hayNoOkHoy).toBe(true);
  });

  it("listMedicionesHoy devuelve todas, la más reciente primero, con su fuera de rango", async () => {
    await seedUsers();
    const [punto] = await listPuntos();
    const a = await registrarTemperatura(punto.idPunto, -13, userA, detalleOk());
    const b = await registrarTemperatura(punto.idPunto, -5, userA, detalleOk());

    const config = await getConfigTemperaturas();
    const propias = (await listMedicionesHoy(config)).filter((m) => m.userRegistro === EMAIL_A);
    expect(propias.map((m) => m.idRegistro)).toEqual([b.idRegistro, a.idRegistro]);
    expect(propias[0].fueraDeRango).toBe(true);
    expect(propias[1].fueraDeRango).toBe(false);
    expect(propias[0].tsEdicion).toBeNull();
  });

  it("editarTemperatura corrige los datos, conserva hora y autor, y deja quién editó", async () => {
    await seedUsers();
    const [punto] = await listPuntos();
    const { idRegistro } = await registrarTemperatura(punto.idPunto, -9, userA, detalleOk());
    const antes = await query<{ ts_registro: string }>(
      `SELECT ts_registro::text AS ts_registro FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );

    await editarTemperatura(idRegistro, -12, userB, { idProd, analisisOk: false, observacion: "  textura arenosa  " });

    const fila = await query<{
      temperatura: string;
      analisis_ok: boolean;
      observacion: string | null;
      ts_registro: string;
      user_registro: number;
      ts_edicion: string | null;
      user_edicion: number | null;
    }>(
      `SELECT temperatura, analisis_ok, observacion, ts_registro::text AS ts_registro, user_registro,
              ts_edicion::text AS ts_edicion, user_edicion
       FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(fila.rows[0].temperatura).toBe("-12.0");
    expect(fila.rows[0].analisis_ok).toBe(false);
    expect(fila.rows[0].observacion).toBe("textura arenosa");
    expect(fila.rows[0].ts_registro).toBe(antes.rows[0].ts_registro);
    expect(fila.rows[0].user_registro).toBe(userA);
    expect(fila.rows[0].ts_edicion).not.toBeNull();
    expect(fila.rows[0].user_edicion).toBe(userB);

    // Pasar de No OK a OK descarta la observación.
    await editarTemperatura(idRegistro, -12.5, userB, { idProd, analisisOk: true, observacion: "se descarta" });
    const ok = await query<{ observacion: string | null }>(
      `SELECT observacion FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(ok.rows[0].observacion).toBeNull();
  });

  it("editarTemperatura no agrega una medición nueva", async () => {
    await seedUsers();
    const [punto] = await listPuntos();
    const { idRegistro } = await registrarTemperatura(punto.idPunto, -9, userA, detalleOk());
    const antes = await estadoDelPunto(punto.idPunto);

    await editarTemperatura(idRegistro, -12, userA, detalleOk());

    const despues = await estadoDelPunto(punto.idPunto);
    expect(despues.medicionesHoy).toBe(antes.medicionesHoy);
  });

  it("editarTemperatura valida igual que al cargar", async () => {
    await seedUsers();
    const [punto] = await listPuntos();
    const { idRegistro } = await registrarTemperatura(punto.idPunto, -12, userA, detalleOk());

    await expect(editarTemperatura(idRegistro, 150, userA, detalleOk())).rejects.toThrow(/entre -99,9 y 99,9/);
    await expect(
      editarTemperatura(idRegistro, -12, userA, { idProd, analisisOk: false, observacion: "   " })
    ).rejects.toThrow("Escribí la observación del análisis No OK.");
    await expect(editarTemperatura(idRegistro, -12, userA, { idProd: 0, analisisOk: true, observacion: null })).rejects.toThrow(
      "Elegí el sabor que medís."
    );
  });

  it("editarTemperatura rechaza una medición que no existe", async () => {
    await seedUsers();
    await expect(editarTemperatura(2147483647, -12, userA, detalleOk())).rejects.toThrow("Esa medición ya no existe.");
  });

  it("editarTemperatura rechaza una medición de un día anterior", async () => {
    await seedUsers();
    const [punto] = await listPuntos();
    const vieja = await query<{ id_registro: number }>(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, ts_registro, fecha)
       VALUES ($1, -12, $2, now() - interval '3 days', CURRENT_DATE - 3) RETURNING id_registro`,
      [punto.idPunto, userA]
    );

    await expect(editarTemperatura(vieja.rows[0].id_registro, -13, userA, detalleOk())).rejects.toThrow(
      "Solo se pueden editar las mediciones de hoy."
    );
  });
});

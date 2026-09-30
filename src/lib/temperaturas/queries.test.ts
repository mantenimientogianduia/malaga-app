import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../db";
import {
  listPuntos,
  getConfigTemperaturas,
  updateConfigTemperaturas,
  listPuntosConEstadoHoy,
  registrarTemperatura,
  listHistorialReciente,
  getResumen30Dias,
  deshacerRegistroTemperatura,
} from "./queries";

describe("temperaturas queries — base", () => {
  beforeEach(async () => {
    await query("TRUNCATE malaga.f_registro_temperaturas RESTART IDENTITY CASCADE");
    await query(`UPDATE malaga.config_temperaturas SET temp_min = -14.0, temp_max = -12.0 WHERE id = 1`);
  });

  afterEach(async () => {
    // seedUser() inserta un usuario de prueba en la tabla REAL malaga.usuarios (compartida
    // con el resto del ERP); a diferencia del beforeEach de arriba, acá NO se hace TRUNCATE
    // de usuarios para no borrar cuentas reales. Se borra puntualmente sólo la fila de prueba,
    // junto con cualquier registro que la haya referenciado (FK user_registro), para poder
    // borrar el usuario sin violar la constraint.
    await query(
      `DELETE FROM malaga.f_registro_temperaturas WHERE user_registro IN (SELECT id_user FROM malaga.usuarios WHERE email = 't-temp@t.com')`
    );
    await query(`DELETE FROM malaga.usuarios WHERE email = 't-temp@t.com'`);
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t-temp@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("listPuntos devuelve los 8 puntos fijos", async () => {
    const puntos = await listPuntos();
    expect(puntos).toHaveLength(8);
    expect(puntos.filter((p) => p.exhibidora === 1)).toHaveLength(4);
    expect(puntos.filter((p) => p.exhibidora === 2)).toHaveLength(4);
    expect(puntos.map((p) => `${p.lado}-${p.posicion}`).sort()).toEqual(
      ["cliente-derecha", "cliente-izquierda", "obrador-derecha", "obrador-izquierda",
       "cliente-derecha", "cliente-izquierda", "obrador-derecha", "obrador-izquierda"].sort()
    );
  });

  it("getConfigTemperaturas y updateConfigTemperaturas leen y actualizan el rango", async () => {
    const inicial = await getConfigTemperaturas();
    expect(inicial.tempMin).toBe("-14.0");
    expect(inicial.tempMax).toBe("-12.0");

    await updateConfigTemperaturas(-16, -10);

    const actualizado = await getConfigTemperaturas();
    expect(actualizado.tempMin).toBe("-16.0");
    expect(actualizado.tempMax).toBe("-10.0");
  });

  it("listPuntosConEstadoHoy marca dentro y fuera de rango correctamente", async () => {
    const userRegistro = await seedUser();
    const puntos = await listPuntos();
    const [p1, p2, p3] = puntos;

    await query(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro) VALUES ($1, -13.0, $2)`,
      [p1.idPunto, userRegistro]
    );
    await query(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro) VALUES ($1, -8.0, $2)`,
      [p2.idPunto, userRegistro]
    );

    const estado = await listPuntosConEstadoHoy();
    const e1 = estado.find((e) => e.idPunto === p1.idPunto)!;
    const e2 = estado.find((e) => e.idPunto === p2.idPunto)!;
    const e3 = estado.find((e) => e.idPunto === p3.idPunto)!;

    expect(e1.registradoHoy).toBe(true);
    expect(e1.fueraDeRangoHoy).toBe(false);
    expect(e2.registradoHoy).toBe(true);
    expect(e2.fueraDeRangoHoy).toBe(true);
    expect(e3.registradoHoy).toBe(false);
    expect(e3.fueraDeRangoHoy).toBeNull();
  });

  it("registrarTemperatura inserta el registro de hoy", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();

    const { idRegistro } = await registrarTemperatura(punto.idPunto, -13.5, userRegistro);

    const fila = await query<{ temperatura: string; user_registro: number }>(
      `SELECT temperatura, user_registro FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(fila.rows[0].temperatura).toBe("-13.5");
    expect(fila.rows[0].user_registro).toBe(userRegistro);
  });

  it("registrarTemperatura bloquea un segundo registro del mismo punto el mismo día", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();

    await registrarTemperatura(punto.idPunto, -13.5, userRegistro);

    await expect(registrarTemperatura(punto.idPunto, -13.0, userRegistro)).rejects.toThrow(
      "Ya se registró la temperatura de este punto hoy."
    );
  });

  it("listHistorialReciente marca fuera de rango y ordena por más reciente primero", async () => {
    const userRegistro = await seedUser();
    const [p1, p2] = await listPuntos();
    const { idRegistro: idNormal } = await registrarTemperatura(p1.idPunto, -13.0, userRegistro);
    const { idRegistro: idDesvio } = await registrarTemperatura(p2.idPunto, -5.0, userRegistro);

    const historial = await listHistorialReciente();
    expect(historial.map((h) => h.idRegistro)).toEqual([idDesvio, idNormal]);
    expect(historial.find((h) => h.idRegistro === idDesvio)!.fueraDeRango).toBe(true);
    expect(historial.find((h) => h.idRegistro === idNormal)!.fueraDeRango).toBe(false);
  });

  it("getResumen30Dias calcula promedio y cantidad de desvíos por punto", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    await query(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, ts_registro)
       VALUES ($1, -13.0, $2, now() - interval '2 days')`,
      [punto.idPunto, userRegistro]
    );
    await query(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, ts_registro)
       VALUES ($1, -5.0, $2, now() - interval '1 day')`,
      [punto.idPunto, userRegistro]
    );

    const resumen = await getResumen30Dias();
    const fila = resumen.find((r) => r.idPunto === punto.idPunto)!;
    expect(fila.promedio).toBeCloseTo(-9.0, 5);
    expect(fila.desvios).toBe(1);
  });

  it("deshacerRegistroTemperatura borra el registro y libera el punto para hoy", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    const { idRegistro } = await registrarTemperatura(punto.idPunto, -13.0, userRegistro);

    await deshacerRegistroTemperatura(idRegistro);

    const estado = await listPuntosConEstadoHoy();
    expect(estado.find((e) => e.idPunto === punto.idPunto)!.registradoHoy).toBe(false);
    // Vuelve a poder registrarse el mismo día sin error:
    await expect(registrarTemperatura(punto.idPunto, -13.5, userRegistro)).resolves.toBeTruthy();
  });
});

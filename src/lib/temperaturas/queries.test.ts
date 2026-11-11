import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../db";
import {
  listPuntos,
  getConfigTemperaturas,
  updateConfigTemperaturas,
  listPuntosConEstadoHoy,
  registrarTemperatura,
  editarTemperatura,
  listHistorialReciente,
  getResumen30Dias,
  deshacerRegistroTemperatura,
  getCierreHoy,
  cerrarDia,
  reabrirDia,
  listSaboresExhibidos,
  type DetalleRegistro,
} from "./queries";
import { createProducto } from "../productos/queries";

describe("temperaturas queries — base", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_registro_temperaturas, malaga.f_cierre_temperaturas, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE"
    );
    await query(`UPDATE malaga.config_temperaturas SET temp_min = -14.0, temp_max = -12.0 WHERE id = 1`);
  });

  afterEach(async () => {
    // seedUser() inserta un usuario de prueba en la tabla REAL malaga.usuarios (compartida
    // con el resto del ERP); a diferencia del beforeEach de arriba, acá NO se hace TRUNCATE
    // de usuarios para no borrar cuentas reales. Se borra puntualmente sólo la fila de prueba,
    // junto con cualquier registro que la haya referenciado (FK user_registro), para poder
    // borrar el usuario sin violar la constraint.
    await query(
      `DELETE FROM malaga.f_registro_temperaturas WHERE user_registro IN (SELECT id_user FROM malaga.usuarios WHERE email = 't-temp@t.com')
         OR user_edicion IN (SELECT id_user FROM malaga.usuarios WHERE email = 't-temp@t.com')`
    );
    await query(
      `DELETE FROM malaga.f_cierre_temperaturas WHERE user_cierre IN (SELECT id_user FROM malaga.usuarios WHERE email = 't-temp@t.com')`
    );
    await query(`DELETE FROM malaga.usuarios WHERE email = 't-temp@t.com'`);
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t-temp@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  async function seedSabor(detalle = "Vainilla", nro = 1) {
    const p = await createProducto({ detalle, unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES ($1, $2)`, [nro, p.idProd]);
    return p.idProd;
  }

  function detalleOk(idProd: number): DetalleRegistro {
    return { idProd, analisisOk: true, observacion: null };
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

    const config = await getConfigTemperaturas();
    const estado = await listPuntosConEstadoHoy(config);
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
    const idProd = await seedSabor();
    const [punto] = await listPuntos();

    const { idRegistro } = await registrarTemperatura(punto.idPunto, -13.5, userRegistro, detalleOk(idProd));

    const fila = await query<{ temperatura: string; user_registro: number }>(
      `SELECT temperatura, user_registro FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(fila.rows[0].temperatura).toBe("-13.5");
    expect(fila.rows[0].user_registro).toBe(userRegistro);
  });

  it("registrarTemperatura agrega una medición nueva aunque el punto ya tenga una hoy", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();

    const primero = await registrarTemperatura(punto.idPunto, -13.5, userRegistro, detalleOk(idProd));
    const segundo = await registrarTemperatura(punto.idPunto, -13.0, userRegistro, detalleOk(idProd));

    expect(segundo.idRegistro).not.toBe(primero.idRegistro);

    const filas = await query<{ temperatura: string }>(
      `SELECT temperatura FROM malaga.f_registro_temperaturas WHERE id_punto = $1 ORDER BY id_registro`,
      [punto.idPunto]
    );
    expect(filas.rows.map((f) => f.temperatura)).toEqual(["-13.5", "-13.0"]);
  });

  it("registrarTemperatura rechaza cargar o editar si el día ya está cerrado", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    await cerrarDia(userRegistro);

    await expect(registrarTemperatura(punto.idPunto, -13.0, userRegistro, detalleOk(idProd))).rejects.toThrow(
      "El día ya está cerrado y firmado. Reabrilo para poder cargar o editar."
    );
  });

  it("editarTemperatura rechaza editar si el día ya está cerrado", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    const { idRegistro } = await registrarTemperatura(punto.idPunto, -13.0, userRegistro, detalleOk(idProd));
    await cerrarDia(userRegistro);

    await expect(editarTemperatura(idRegistro, -12.0, userRegistro, detalleOk(idProd))).rejects.toThrow(
      "El día ya está cerrado y firmado. Reabrilo para poder cargar o editar."
    );
  });

  it("listHistorialReciente marca fuera de rango y ordena por más reciente primero", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [p1, p2] = await listPuntos();
    const { idRegistro: idNormal } = await registrarTemperatura(p1.idPunto, -13.0, userRegistro, detalleOk(idProd));
    const { idRegistro: idDesvio } = await registrarTemperatura(p2.idPunto, -5.0, userRegistro, detalleOk(idProd));

    const config = await getConfigTemperaturas();
    const historial = await listHistorialReciente(config);
    expect(historial.map((h) => h.idRegistro)).toEqual([idDesvio, idNormal]);
    expect(historial.find((h) => h.idRegistro === idDesvio)!.fueraDeRango).toBe(true);
    expect(historial.find((h) => h.idRegistro === idNormal)!.fueraDeRango).toBe(false);
  });

  it("getResumen30Dias calcula promedio y cantidad de desvíos por punto", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    await query(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, ts_registro, fecha)
       VALUES ($1, -13.0, $2, now() - interval '2 days', CURRENT_DATE - interval '2 days')`,
      [punto.idPunto, userRegistro]
    );
    await query(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, ts_registro, fecha)
       VALUES ($1, -5.0, $2, now() - interval '1 day', CURRENT_DATE - interval '1 day')`,
      [punto.idPunto, userRegistro]
    );

    const config = await getConfigTemperaturas();
    const resumen = await getResumen30Dias(config);
    const fila = resumen.find((r) => r.idPunto === punto.idPunto)!;
    expect(fila.promedio).toBeCloseTo(-9.0, 5);
    expect(fila.desvios).toBe(1);
  });

  it("deshacerRegistroTemperatura borra el registro y libera el punto para hoy", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    const { idRegistro } = await registrarTemperatura(punto.idPunto, -13.0, userRegistro, detalleOk(idProd));

    await deshacerRegistroTemperatura(idRegistro);

    const config = await getConfigTemperaturas();
    const estado = await listPuntosConEstadoHoy(config);
    expect(estado.find((e) => e.idPunto === punto.idPunto)!.registradoHoy).toBe(false);
    // Vuelve a poder registrarse el mismo día sin error:
    await expect(registrarTemperatura(punto.idPunto, -13.5, userRegistro, detalleOk(idProd))).resolves.toBeTruthy();
  });

  it("deshacerRegistroTemperatura rechaza si el día de ese registro está cerrado", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    const { idRegistro } = await registrarTemperatura(punto.idPunto, -13.0, userRegistro, detalleOk(idProd));

    await cerrarDia(userRegistro);

    await expect(deshacerRegistroTemperatura(idRegistro)).rejects.toThrow(
      "No se puede deshacer: el día de ese registro está cerrado y firmado."
    );

    const fila = await query(`SELECT 1 FROM malaga.f_registro_temperaturas WHERE id_registro = $1`, [idRegistro]);
    expect(fila.rows).toHaveLength(1);
  });

  it("cerrarDia crea el cierre de hoy, getCierreHoy lo refleja y reabrirDia lo libera", async () => {
    const userCierre = await seedUser();

    expect(await getCierreHoy()).toBeNull();

    await cerrarDia(userCierre);
    const cierre = await getCierreHoy();
    expect(cierre).not.toBeNull();
    expect(cierre!.userCierre).toBe("t-temp@t.com");

    await reabrirDia();
    expect(await getCierreHoy()).toBeNull();
  });

  it("registrarTemperatura guarda sabor, análisis OK y descarta la observación", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();

    const { idRegistro } = await registrarTemperatura(punto.idPunto, -12.5, userRegistro, {
      idProd,
      analisisOk: true,
      observacion: "esto se descarta",
    });

    const fila = await query<{ id_prod: number; analisis_ok: boolean; observacion: string | null }>(
      `SELECT id_prod, analisis_ok, observacion FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(fila.rows[0]).toEqual({ id_prod: idProd, analisis_ok: true, observacion: null });
  });

  it("registrarTemperatura guarda un No OK con la observación recortada", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();

    const { idRegistro } = await registrarTemperatura(punto.idPunto, -9, userRegistro, {
      idProd,
      analisisOk: false,
      observacion: "  textura arenosa  ",
    });

    const fila = await query<{ analisis_ok: boolean; observacion: string }>(
      `SELECT analisis_ok, observacion FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(fila.rows[0]).toEqual({ analisis_ok: false, observacion: "textura arenosa" });
  });

  it("registrarTemperatura exige el sabor", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    await expect(
      registrarTemperatura(punto.idPunto, -12, userRegistro, { idProd: 0, analisisOk: true, observacion: null })
    ).rejects.toThrow("Elegí el sabor que medís.");
  });

  it("registrarTemperatura rechaza un sabor que no está en la cartilla", async () => {
    const userRegistro = await seedUser();
    await seedSabor();
    const fuera = await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const [punto] = await listPuntos();
    await expect(
      registrarTemperatura(punto.idPunto, -12, userRegistro, { idProd: fuera.idProd, analisisOk: true, observacion: null })
    ).rejects.toThrow("Ese sabor no está en la cartilla actual.");
  });

  it("registrarTemperatura exige indicar el análisis", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    await expect(
      registrarTemperatura(punto.idPunto, -12, userRegistro, {
        idProd,
        analisisOk: undefined as unknown as boolean,
        observacion: null,
      })
    ).rejects.toThrow("Indicá el análisis sensorial/visual: OK o No OK.");
  });

  it("registrarTemperatura exige la observación cuando el análisis es No OK", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    for (const observacion of [null, "", "   "]) {
      await expect(
        registrarTemperatura(punto.idPunto, -12, userRegistro, { idProd, analisisOk: false, observacion })
      ).rejects.toThrow("Escribí la observación del análisis No OK.");
    }
  });

  it("la base rechaza un No OK sin observación aunque se inserte directo", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    for (const observacion of [null, "", "   "]) {
      await expect(
        query(
          `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, analisis_ok, observacion)
           VALUES ($1, -12, $2, false, $3)`,
          [punto.idPunto, userRegistro, observacion]
        )
      ).rejects.toThrow(/chk_registro_temperaturas_observacion/);
    }
  }, 30000); // 3 inserts rechazados contra la base remota: cerca de los 5 s por defecto

  it("editar un registro sobrescribe sabor, análisis y observación", async () => {
    const userRegistro = await seedUser();
    const vainilla = await seedSabor("Vainilla", 1);
    const chocolate = await seedSabor("Chocolate", 2);
    const [punto] = await listPuntos();

    const primero = await registrarTemperatura(punto.idPunto, -12, userRegistro, detalleOk(vainilla));
    await editarTemperatura(primero.idRegistro, -9, userRegistro, {
      idProd: chocolate,
      analisisOk: false,
      observacion: "con cristales",
    });

    const fila = await query<{ id_prod: number; analisis_ok: boolean; observacion: string }>(
      `SELECT id_prod, analisis_ok, observacion FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [primero.idRegistro]
    );
    expect(fila.rows[0]).toEqual({ id_prod: chocolate, analisis_ok: false, observacion: "con cristales" });
  }, 30000); // crea 2 productos en la base remota: puede superar los 5 s por defecto

  it("listPuntosConEstadoHoy devuelve sabor, análisis y observación del registro de hoy", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor("Pistacho");
    const [p1, p2] = await listPuntos();
    await registrarTemperatura(p1.idPunto, -12, userRegistro, {
      idProd,
      analisisOk: false,
      observacion: "color apagado",
    });

    const config = await getConfigTemperaturas();
    const estado = await listPuntosConEstadoHoy(config);
    const e1 = estado.find((e) => e.idPunto === p1.idPunto)!;
    const e2 = estado.find((e) => e.idPunto === p2.idPunto)!;
    expect(e1).toMatchObject({
      idProdHoy: idProd,
      saborHoy: "Pistacho",
      analisisOkHoy: false,
      observacionHoy: "color apagado",
    });
    expect(e2).toMatchObject({ idProdHoy: null, saborHoy: null, analisisOkHoy: null, observacionHoy: null });
  });

  it("listHistorialReciente devuelve los campos nuevos y null en los registros viejos", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor("Pistacho");
    const [p1, p2] = await listPuntos();
    // Registro "viejo": sin sabor ni análisis.
    await query(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, ts_registro)
       VALUES ($1, -12, $2, now() - interval '1 hour')`,
      [p1.idPunto, userRegistro]
    );
    const { idRegistro } = await registrarTemperatura(p2.idPunto, -13, userRegistro, detalleOk(idProd));

    const config = await getConfigTemperaturas();
    const historial = await listHistorialReciente(config);
    const nuevo = historial.find((h) => h.idRegistro === idRegistro)!;
    const viejo = historial.find((h) => h.idRegistro !== idRegistro)!;
    expect(nuevo).toMatchObject({ saborDetalle: "Pistacho", analisisOk: true, observacion: null });
    expect(viejo).toMatchObject({ saborDetalle: null, analisisOk: null, observacion: null });
  });

  it("listSaboresExhibidos devuelve los sabores de la cartilla en orden de posición", async () => {
    await seedSabor("Vainilla", 3);
    await seedSabor("Chocolate", 1);
    await seedSabor("Pistacho", 2);

    const sabores = await listSaboresExhibidos();
    expect(sabores.map((s) => [s.nroPosicion, s.detalle])).toEqual([
      [1, "Chocolate"],
      [2, "Pistacho"],
      [3, "Vainilla"],
    ]);
  });

  it("registrarTemperatura rechaza temperaturas que no son un número razonable", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    for (const temperatura of [NaN, Infinity, -Infinity, 1234, -100]) {
      await expect(
        registrarTemperatura(punto.idPunto, temperatura, userRegistro, detalleOk(idProd))
      ).rejects.toThrow("La temperatura tiene que ser un número entre -99,9 y 99,9 °C.");
    }
  }, 30000); // varias validaciones contra la base remota: puede superar los 5 s por defecto

  it("registrarTemperatura acepta los extremos -99.9 y 99.9", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();

    const { idRegistro } = await registrarTemperatura(punto.idPunto, -99.9, userRegistro, detalleOk(idProd));
    await registrarTemperatura(punto.idPunto, 99.9, userRegistro, detalleOk(idProd));

    const fila = await query<{ temperatura: string }>(
      `SELECT temperatura FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(fila.rows[0].temperatura).toBe("99.9");
  }, 30000); // crea un producto y dos escrituras remotas: puede superar los 5 s por defecto

  it("registrarTemperatura rechaza un idProd negativo o decimal", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    for (const idProd of [-1, 1.5]) {
      await expect(
        registrarTemperatura(punto.idPunto, -12, userRegistro, { idProd, analisisOk: true, observacion: null })
      ).rejects.toThrow("Elegí el sabor que medís.");
    }
  });

  it("editar de No OK a OK deja la observación en NULL", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();

    const primero = await registrarTemperatura(punto.idPunto, -9, userRegistro, {
      idProd,
      analisisOk: false,
      observacion: "con cristales",
    });
    await editarTemperatura(primero.idRegistro, -12, userRegistro, {
      idProd,
      analisisOk: true,
      observacion: "esto se descarta",
    });

    const fila = await query<{ analisis_ok: boolean; observacion: string | null }>(
      `SELECT analisis_ok, observacion FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [primero.idRegistro]
    );
    expect(fila.rows[0]).toEqual({ analisis_ok: true, observacion: null });
  }, 30000); // crea un producto y dos escrituras remotas: puede superar los 5 s por defecto
});

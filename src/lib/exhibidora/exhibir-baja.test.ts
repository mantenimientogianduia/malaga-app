import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { deshacerCierreRemanente, listCierresRecientes } from "../stock/queries";
import { exhibirPartida, darDeBajaBachaPt, listPartidasEnObrador } from "./queries";

// malaga.usuarios NO se trunca nunca: es la tabla real de cuentas. Se borra solo la fila de prueba,
// después de vaciar las tablas que la referencian.
async function limpiar() {
  await query(
    `TRUNCATE malaga.f_cierre_dia_base, malaga.f_cierre_dia_sabor, malaga.f_cierre_dia_bacha, malaga.f_cierre_dia,
              malaga.f_pcp_pronostico, malaga.f_quiebres, malaga.f_trazabilidad_op, malaga.f_partidas_stock,
              malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_exhibidora,
              malaga.d_productos RESTART IDENTITY CASCADE`
  );
  await query(`DELETE FROM malaga.usuarios WHERE email = 'bachas@t.com'`);
}

// Los tests crean varias filas contra la base remota: el timeout por defecto de 5 s es justo.
const TIMEOUT = 30000;

async function seed() {
  const u = await query<{ id_user: number }>(
    `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('bachas@t.com', 'x', 'admin') RETURNING id_user`
  );
  const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
  const slot = await query<{ id_exhibidora: number }>(
    `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
    [pt.idProd]
  );
  return { idUser: u.rows[0].id_user, idProd: pt.idProd, idExhibidora: slot.rows[0].id_exhibidora };
}

async function crearPartida(idProd: number, fechaFab = "2026-10-01") {
  const r = await query<{ id_partistock: number }>(
    `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
     VALUES ($1, 4, $2, 'L') RETURNING id_partistock`,
    [idProd, fechaFab]
  );
  return r.rows[0].id_partistock;
}

describe("exhibirPartida con momento propio", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("guarda el momento indicado como ts_exhibicion", async () => {
    const s = await seed();
    const idPartida = await crearPartida(s.idProd);

    await exhibirPartida(idPartida, s.idExhibidora, s.idUser, false, "2026-10-10T12:00:00Z");

    const r = await query<{ ok: boolean }>(
      `SELECT ts_exhibicion = '2026-10-10T12:00:00Z'::timestamptz AS ok FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [idPartida]
    );
    expect(r.rows[0].ok).toBe(true);
  }, TIMEOUT);

  it("sin momento usa la hora actual", async () => {
    const s = await seed();
    const idPartida = await crearPartida(s.idProd);

    await exhibirPartida(idPartida, s.idExhibidora, s.idUser);

    const r = await query<{ cerca: boolean }>(
      `SELECT abs(extract(epoch FROM (now() - ts_exhibicion))) < 120 AS cerca FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [idPartida]
    );
    expect(r.rows[0].cerca).toBe(true);
  }, TIMEOUT);

  it("rechaza un momento futuro, uno anterior a la fabricación y uno inválido", async () => {
    const s = await seed();
    const idPartida = await crearPartida(s.idProd, "2026-10-05");

    const enUnaHora = new Date(Date.now() + 3600 * 1000).toISOString();
    await expect(exhibirPartida(idPartida, s.idExhibidora, s.idUser, false, enUnaHora)).rejects.toThrow(
      "no pueden ser futuras"
    );
    await expect(
      exhibirPartida(idPartida, s.idExhibidora, s.idUser, false, "2026-10-04T12:00:00Z")
    ).rejects.toThrow("anterior al día de fabricación");
    await expect(exhibirPartida(idPartida, s.idExhibidora, s.idUser, false, "no-es-fecha")).rejects.toThrow(
      "no son válidas"
    );

    const r = await query<{ ts_exhibicion: string | null }>(
      `SELECT ts_exhibicion FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [idPartida]
    );
    expect(r.rows[0].ts_exhibicion).toBeNull();
  }, TIMEOUT);

  it("rechaza exhibir una bacha dada de baja", async () => {
    const s = await seed();
    const idPartida = await crearPartida(s.idProd);
    await darDeBajaBachaPt(idPartida, "ajuste", "no existe más", s.idUser);

    await expect(exhibirPartida(idPartida, s.idExhibidora, s.idUser)).rejects.toThrow("dada de baja");
  }, TIMEOUT);

  it("cierra el quiebre abierto con el momento indicado, nunca antes del quiebre", async () => {
    const s = await seed();
    const a = await crearPartida(s.idProd);
    const b = await crearPartida(s.idProd);
    await query(
      `INSERT INTO malaga.f_quiebres (id_prod, ts_quiebre_real, user_carga) VALUES ($1, '2026-10-08T10:00:00Z', $2)`,
      [s.idProd, s.idUser]
    );

    await exhibirPartida(a, s.idExhibidora, s.idUser, false, "2026-10-10T12:00:00Z");
    const cerrado = await query<{ ok: boolean }>(
      `SELECT ts_repuesto = '2026-10-10T12:00:00Z'::timestamptz AS ok FROM malaga.f_quiebres WHERE id_prod = $1`,
      [s.idProd]
    );
    expect(cerrado.rows[0].ok).toBe(true);

    // Un quiebre posterior al momento indicado se cierra en el momento del quiebre, no antes.
    await query(`DELETE FROM malaga.f_quiebres`);
    await query(
      `INSERT INTO malaga.f_quiebres (id_prod, ts_quiebre_real, user_carga) VALUES ($1, '2026-10-12T10:00:00Z', $2)`,
      [s.idProd, s.idUser]
    );
    await exhibirPartida(b, s.idExhibidora, s.idUser, false, "2026-10-11T12:00:00Z");
    const sinRetroceder = await query<{ ok: boolean }>(
      `SELECT ts_repuesto = '2026-10-12T10:00:00Z'::timestamptz AS ok FROM malaga.f_quiebres WHERE id_prod = $1`,
      [s.idProd]
    );
    expect(sinRetroceder.rows[0].ok).toBe(true);
  }, TIMEOUT);

  it("exhibir con fecha pasada una bacha vieja no cambia la bacha vigente de la posición", async () => {
    const s = await seed();
    const vieja = await crearPartida(s.idProd);
    const nueva = await crearPartida(s.idProd);

    await exhibirPartida(nueva, s.idExhibidora, s.idUser, false, "2026-10-15T10:00:00Z");
    await exhibirPartida(vieja, s.idExhibidora, s.idUser, false, "2026-10-10T10:00:00Z");

    const vigente = await query<{ id_partistock: number }>(
      `SELECT id_partistock FROM malaga.v_stock_pt_vivo WHERE id_exhibidora = $1`,
      [s.idExhibidora]
    );
    expect(vigente.rows.map((r) => r.id_partistock)).toEqual([nueva]);
  }, TIMEOUT);
});

describe("darDeBajaBachaPt", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("guarda motivo, observación y usuario, y la bacha deja de estar en el obrador", async () => {
    const s = await seed();
    const idPartida = await crearPartida(s.idProd);

    await darDeBajaBachaPt(idPartida, "scrap", "  se cayó al piso  ", s.idUser);

    const r = await query<{ motivo: string; obs: string; user: number; baja: string | null }>(
      `SELECT motivo_baja_manual AS motivo, obs_baja_manual AS obs, user_baja_manual AS "user", ts_baja_manual::text AS baja
       FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [idPartida]
    );
    expect(r.rows[0]).toMatchObject({ motivo: "scrap", obs: "se cayó al piso", user: s.idUser });
    expect(r.rows[0].baja).not.toBeNull();
    expect((await listPartidasEnObrador()).map((p) => p.idPartida)).not.toContain(idPartida);
  }, TIMEOUT);

  it("exige observación y un motivo válido", async () => {
    const s = await seed();
    const idPartida = await crearPartida(s.idProd);

    for (const obs of ["", "   "]) {
      await expect(darDeBajaBachaPt(idPartida, "ajuste", obs, s.idUser)).rejects.toThrow(
        "Escribí la observación de la baja."
      );
    }
    await expect(
      darDeBajaBachaPt(idPartida, "otro" as unknown as "ajuste", "algo", s.idUser)
    ).rejects.toThrow("Elegí el motivo de la baja.");
  }, TIMEOUT);

  it("rechaza bachas exhibidas, ya dadas de baja o de bases", async () => {
    const s = await seed();
    const exhibida = await crearPartida(s.idProd);
    await exhibirPartida(exhibida, s.idExhibidora, s.idUser);
    const conBaja = await crearPartida(s.idProd);
    await darDeBajaBachaPt(conBaja, "ajuste", "primera baja", s.idUser);
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const deBase = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 5, '2026-10-01', 'B') RETURNING id_partistock`,
      [semi.idProd]
    );

    for (const id of [exhibida, conBaja, deBase.rows[0].id_partistock]) {
      await expect(darDeBajaBachaPt(id, "ajuste", "otra baja", s.idUser)).rejects.toThrow(
        "No se pudo dar de baja"
      );
    }
  }, TIMEOUT);

  it("la baja aparece en los cierres recientes con su observación y deshacer la limpia", async () => {
    const s = await seed();
    const idPartida = await crearPartida(s.idProd);
    await darDeBajaBachaPt(idPartida, "vencido", "pasó la fecha", s.idUser);

    const lista = await listCierresRecientes();
    const fila = lista.find((c) => c.idPartida === idPartida)!;
    expect(fila).toMatchObject({ motivoBaja: "vencido", observacion: "pasó la fecha" });

    await deshacerCierreRemanente(idPartida);
    const r = await query<{ obs: string | null; baja: string | null }>(
      `SELECT obs_baja_manual AS obs, ts_baja_manual AS baja FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [idPartida]
    );
    expect(r.rows[0]).toEqual({ obs: null, baja: null });
  }, TIMEOUT);
});

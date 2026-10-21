# Bachas: exhibir con fecha editable y baja sin exhibir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exhibir una bacha con fecha y hora editables, poder dar de baja una bacha sin exhibirla (motivo + observación, con registro en Auditoría) y quitar del cierre de PCP la opción de destildar bachas.

**Architecture:** `exhibirPartida` recibe un momento opcional y lo valida (no futuro, no anterior a la fabricación); una función nueva `darDeBajaBachaPt` registra la baja con una columna de observación nueva. En Exhibir, un formulario cliente compartido (`FormularioExhibir`) envía con `onSubmit` + `startTransition` (para no perder lo cargado ante errores) y un componente `BajaBacha` abre la baja inline. El cierre de PCP deja de dar de baja bachas y avisa que se resuelva desde Exhibir.

**Tech Stack:** Next.js 16 App Router, TypeScript, Postgres con SQL crudo (`src/lib/db.ts`), node-pg-migrate, vitest (`npm run test:db`), `useActionState`.

**Spec:** `docs/superpowers/specs/2026-10-21-bachas-exhibir-baja-design.md`

---

## Contexto para quien implemente

- **Base de datos:** `npm run test:db` corre contra la base compartida (todavía sin datos reales; el dueño autorizó correr la suite completa libremente). Cada corrida completa vacía productos, recetas, exhibidora y partidas; para volver a tener catálogo hay que correr `scripts/import-historico.ts` y `scripts/import-recetas.ts` (Task 7). Los tests nuevos usan el usuario `bachas@t.com` y lo borran puntualmente; **nunca** `TRUNCATE` de `malaga.usuarios`.
- **React:** el proyecto tiene la regla de ESLint `react-hooks/set-state-in-effect` como error: no uses `useEffect` para sincronizar estado. En React 19 un `<form action={fn}>` hace `reset()` del formulario al terminar la acción, **también con error** (se pierde lo cargado): por eso los formularios nuevos usan `onSubmit` + `startTransition(() => formAction(formData))`, como `src/app/(app)/temperaturas/FormularioRegistro.tsx`.
- **Next.js 16:** si algo de las APIs no te cierra, leé `node_modules/next/dist/docs/`.
- **Fechas:** `fechaEnMalaga(date)` de `src/lib/pcp/fechas.ts` devuelve la fecha `YYYY-MM-DD` en la zona de Málaga. La hora la manda el dispositivo del usuario (ISO con offset), como ya hace el proyecto al finalizar una OP.
- **Trabajo ajeno:** si hay cambios sin commitear que no son tuyos, no los toques: `git add <ruta exacta>`, nunca `git add -A` ni `git commit -a`.
- **Comandos:** un archivo de tests: `npm run test:db -- src/lib/exhibidora/exhibir-baja.test.ts`; suite completa: `npm run test:db`; migraciones: `npm run migrate:up`; lint: `npm run lint`; tipos: `npx tsc --noEmit`.
- **Estilo de UI:** reutilizá las clases del módulo (`card`, `text-ink`, `text-ink-soft`, `bg-copper`, `bg-warn-tint`, `bg-bad-tint`, `border-border`, `bg-surface-raised`).

---

## File Structure

- **Create:** `migrations/1791100000000_add-obs-baja-to-partidas.js`
- **Modify:** `src/lib/exhibidora/queries.ts` — `exhibirPartida` (momento opcional + validaciones) y nuevo `darDeBajaBachaPt`.
- **Modify:** `src/lib/stock/queries.ts` — `listCierresRecientes` devuelve la observación; `deshacerCierreRemanente` la limpia.
- **Create:** `src/lib/exhibidora/exhibir-baja.test.ts` — tests de lo anterior.
- **Modify:** `src/app/(app)/exhibir/actions.ts` — acciones con estado de error.
- **Create:** `src/app/(app)/exhibir/FechaHoraExhibicion.tsx`, `FormularioExhibir.tsx`, `BajaBacha.tsx`.
- **Modify:** `src/app/(app)/exhibir/ExhibirSlot.tsx`, `ExhibirGroup.tsx` — usan los componentes nuevos.
- **Modify:** `src/app/(app)/auditoria/page.tsx` — muestra la observación de la baja.
- **Modify (cierre de PCP):** `src/lib/pcp/cierre-queries.ts` (+ `cierre-queries.test.ts`), `src/app/(app)/pcp/cierre-actions.ts`, `src/app/(app)/pcp/CierreDiaForm.tsx` — se quita `ausentes`.

---

### Task 1: Migración

**Files:**
- Create: `migrations/1791100000000_add-obs-baja-to-partidas.js`

- [ ] **Step 1: Escribir la migración**

```js
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE malaga.f_partidas_stock ADD COLUMN obs_baja_manual TEXT;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE malaga.f_partidas_stock DROP COLUMN obs_baja_manual;`);
};
```

- [ ] **Step 2: Aplicarla**

Run: `npm run migrate:up`
Expected: `1791100000000_add-obs-baja-to-partidas` aplicada y `Migrations complete!`. (Si falla por conexión, revisá que `DATABASE_URL` y `PGHOST` del `.env` apunten a la base vigente; no los cambies.)

- [ ] **Step 3: Verificar la columna**

Creá `scripts/_tmp-verify.ts`:

```ts
import { query } from "../src/lib/db";
(async () => {
  const r = await query<{ column_name: string; is_nullable: string }>(
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_schema = 'malaga' AND table_name = 'f_partidas_stock' AND column_name = 'obs_baja_manual'`
  );
  console.log(JSON.stringify(r.rows));
  process.exit(0);
})();
```

Run: `npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/_tmp-verify.ts`
Expected: `[{"column_name":"obs_baja_manual","is_nullable":"YES"}]`. Después borrá el script.

- [ ] **Step 4: Commit**

```bash
git add migrations/1791100000000_add-obs-baja-to-partidas.js
git commit -m "feat: agregar observacion de baja a las partidas"
```

---

### Task 2: Consultas (exhibir con momento propio, baja de bachas, observación)

**Files:**
- Modify: `src/lib/exhibidora/queries.ts`
- Modify: `src/lib/stock/queries.ts`
- Create: `src/lib/exhibidora/exhibir-baja.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Creá `src/lib/exhibidora/exhibir-baja.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/exhibidora/exhibir-baja.test.ts`
Expected: FAIL (`darDeBajaBachaPt` no existe; `exhibirPartida` ignora el 5.º argumento; `observacion` no existe en `listCierresRecientes`).

- [ ] **Step 3: Implementar en `src/lib/exhibidora/queries.ts`**

1. Agregá los imports al principio del archivo:

```ts
import type { MotivoBaja } from "../stock/queries";
import { fechaEnMalaga } from "../pcp/fechas";
```

2. Reemplazá la función `exhibirPartida` completa por:

```ts
export async function exhibirPartida(
  idPartida: number,
  idExhibidora: number,
  userExhibicion: number,
  oficializarCambioAhora = false,
  tsExhibicion?: string | null
): Promise<void> {
  const ts = tsExhibicion ? new Date(tsExhibicion) : null;
  if (ts !== null && Number.isNaN(ts.getTime())) {
    throw new Error("La fecha y hora de exhibición no son válidas.");
  }
  // 1 minuto de tolerancia por si el reloj del dispositivo va levemente adelantado.
  if (ts !== null && ts.getTime() > Date.now() + 60_000) {
    throw new Error("La fecha y hora de exhibición no pueden ser futuras.");
  }
  const tsParam = ts === null ? null : ts.toISOString();

  await withTransaction(async (client) => {
    const previa = await client.query<{ fecha_fab: string; ts_baja_manual: string | null }>(
      `SELECT fecha_fab::text AS fecha_fab, ts_baja_manual::text AS ts_baja_manual
       FROM malaga.f_partidas_stock WHERE id_partistock = $1 FOR UPDATE`,
      [idPartida]
    );
    const fila = previa.rows[0];
    if (!fila) throw new Error("La bacha no existe.");
    if (fila.ts_baja_manual !== null) throw new Error("Esa bacha está dada de baja y no se puede exhibir.");
    if (ts !== null && fechaEnMalaga(ts) < fila.fecha_fab) {
      throw new Error("La exhibición no puede ser anterior al día de fabricación de la bacha.");
    }

    const partidaResult = await client.query<{ id_prod: number }>(
      `UPDATE malaga.f_partidas_stock
       SET ts_exhibicion = COALESCE($4::timestamptz, now()), id_exhibidora = $2, user_exhibicion = $3
       WHERE id_partistock = $1
       RETURNING id_prod`,
      [idPartida, idExhibidora, userExhibicion, tsParam]
    );
    const idProd = partidaResult.rows[0].id_prod;

    if (oficializarCambioAhora) {
      await client.query(
        `UPDATE malaga.d_exhibidora
         SET id_prod_ant = id_prod, id_prod = id_prod_fut, id_prod_fut = NULL,
             ts_ulticambio = now(), ts_cambio_programado = NULL
         WHERE id_exhibidora = $1 AND id_prod_fut IS NOT NULL`,
        [idExhibidora]
      );
    }

    // El quiebre se cierra en el momento de la exhibición, pero nunca antes de que haya empezado.
    await client.query(
      `UPDATE malaga.f_quiebres
       SET ts_repuesto = GREATEST(ts_quiebre_real, COALESCE($3::timestamptz, now())), id_partida_repuso = $2
       WHERE id_prod = $1 AND ts_repuesto IS NULL`,
      [idProd, idPartida, tsParam]
    );
  });
}
```

3. Agregá al final del archivo:

```ts
// Baja manual de una bacha de PT que nunca se exhibió (descarte, vencimiento o ajuste de stock).
export async function darDeBajaBachaPt(
  idPartida: number,
  motivo: MotivoBaja,
  observacion: string,
  userBaja: number
): Promise<void> {
  if (!["scrap", "vencido", "ajuste"].includes(motivo)) {
    throw new Error("Elegí el motivo de la baja.");
  }
  const obs = observacion.trim();
  if (obs === "") {
    throw new Error("Escribí la observación de la baja.");
  }

  const result = await query(
    `UPDATE malaga.f_partidas_stock ps
     SET ts_baja_manual = now(), motivo_baja_manual = $2, obs_baja_manual = $3, user_baja_manual = $4
     FROM malaga.d_productos p
     WHERE ps.id_partistock = $1 AND p.id_prod = ps.id_prod AND p.tipo_producto = 'PT'
       AND ps.ts_exhibicion IS NULL AND ps.ts_baja_manual IS NULL`,
    [idPartida, motivo, obs, userBaja]
  );
  if (result.rowCount === 0) {
    throw new Error("No se pudo dar de baja: la bacha ya fue exhibida o dada de baja.");
  }
}
```

- [ ] **Step 4: Implementar en `src/lib/stock/queries.ts`**

1. En la interfaz `CierreReciente` agregá `observacion: string | null;` (después de `userBajaManual`).
2. En `listCierresRecientes`: agregá `observacion: string | null;` al tipo de la fila, `ps.obs_baja_manual AS observacion` al `SELECT` (después de `u.email AS user_baja_manual`) y `observacion: r.observacion,` al `map`.
3. En `deshacerCierreRemanente`, el `UPDATE` pasa a:

```ts
    `UPDATE malaga.f_partidas_stock
     SET ts_baja_manual = NULL, motivo_baja_manual = NULL, obs_baja_manual = NULL, user_baja_manual = NULL
     WHERE id_partistock = $1`,
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/exhibidora/exhibir-baja.test.ts`
Expected: PASS (10 tests).
Run también `npm run test:db -- src/lib/exhibidora/queries.test.ts` y `npm run test:db -- src/lib/stock/queries.test.ts`.
Expected: PASS (los tests existentes de exhibir y de stock siguen pasando).

- [ ] **Step 6: Commit**

```bash
git add src/lib/exhibidora/queries.ts src/lib/exhibidora/exhibir-baja.test.ts src/lib/stock/queries.ts
git commit -m "feat: exhibir con momento propio y dar de baja bachas con observacion"
```

---

### Task 3: Acciones del servidor de Exhibir

**Files:**
- Modify: `src/app/(app)/exhibir/actions.ts`

Sin test automático (capa fina sobre funciones probadas); se verifica en el navegador (Task 7).

- [ ] **Step 1: Reemplazar el archivo**

`src/app/(app)/exhibir/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { exhibirPartida, darDeBajaBachaPt } from "@/lib/exhibidora/queries";
import type { MotivoBaja } from "@/lib/stock/queries";

type Estado = { error?: string; ok?: boolean } | undefined;

function revalidarTodo() {
  revalidatePath("/exhibir");
  revalidatePath("/planificacion");
  revalidatePath("/stock");
  revalidatePath("/auditoria");
  revalidatePath("/pcp");
}

export async function exhibirPartidaAction(_prevState: Estado, formData: FormData): Promise<Estado> {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const idExhibidora = Number(formData.get("idExhibidora"));
  const oficializarCambioAhora = formData.get("oficializarCambioAhora") === "on";
  const tsRaw = String(formData.get("tsExhibicion") ?? "").trim();
  if (!idPartida || !idExhibidora) return { error: "Faltan datos de la bacha." };

  try {
    await exhibirPartida(idPartida, idExhibidora, user.idUser, oficializarCambioAhora, tsRaw === "" ? null : tsRaw);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo exhibir la bacha." };
  }

  revalidarTodo();
  return { ok: true };
}

export async function darDeBajaBachaAction(_prevState: Estado, formData: FormData): Promise<Estado> {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const motivo = String(formData.get("motivo") ?? "") as MotivoBaja;
  const observacion = String(formData.get("observacion") ?? "");
  if (!idPartida) return { error: "Faltan datos de la bacha." };

  try {
    await darDeBajaBachaPt(idPartida, motivo, observacion, user.idUser);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo dar de baja la bacha." };
  }

  revalidarTodo();
  return { ok: true };
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` — Expected: errores SOLO en `ExhibirSlot.tsx` y `ExhibirGroup.tsx` (todavía usan `exhibirPartidaAction` como `<form action>` con la firma vieja); se arreglan en el Task 4. Cualquier otro error hay que corregirlo.
Run: `npx eslint "src/app/(app)/exhibir/actions.ts"` — Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/exhibir/actions.ts"
git commit -m "feat: acciones de exhibir con fecha propia y de baja de bachas"
```

---

### Task 4: Pantalla Exhibir (fecha editable y baja)

**Files:**
- Create: `src/app/(app)/exhibir/FechaHoraExhibicion.tsx`
- Create: `src/app/(app)/exhibir/FormularioExhibir.tsx`
- Create: `src/app/(app)/exhibir/BajaBacha.tsx`
- Modify: `src/app/(app)/exhibir/ExhibirSlot.tsx`
- Modify: `src/app/(app)/exhibir/ExhibirGroup.tsx`

- [ ] **Step 1: Selector de fecha y hora**

`src/app/(app)/exhibir/FechaHoraExhibicion.tsx`:

```tsx
"use client";

import { useState } from "react";

// YYYY-MM-DDTHH:mm en hora local del dispositivo (formato de <input type="datetime-local">).
function aInputLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Por defecto la bacha se exhibe "ahora" (el servidor usa su reloj). Solo si el usuario toca "Cambiar"
// se abre el campo ya cargado con la hora actual del dispositivo, y se envía el instante elegido (ISO).
// El campo no existe hasta que se pide, así no hay diferencias entre el HTML del servidor y el del navegador.
export function FechaHoraExhibicion() {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");

  const fecha = editando && valor !== "" ? new Date(valor) : null;
  const iso = fecha !== null && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : "";

  return (
    <div className="flex flex-col gap-1 text-[11px] text-ink-soft">
      <input type="hidden" name="tsExhibicion" value={iso} />
      {editando ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Fecha y hora</span>
          <input
            type="datetime-local"
            required
            aria-label="Fecha y hora de la exhibición"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 text-base text-ink sm:text-xs"
          />
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              setValor("");
            }}
            className="font-medium text-copper hover:text-copper-strong"
          >
            Usar ahora
          </button>
        </div>
      ) : (
        <p>
          Fecha y hora: ahora ·{" "}
          <button
            type="button"
            onClick={() => {
              setValor(aInputLocal(new Date()));
              setEditando(true);
            }}
            className="font-medium text-copper hover:text-copper-strong"
          >
            Cambiar
          </button>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Formulario de exhibir compartido**

`src/app/(app)/exhibir/FormularioExhibir.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useState } from "react";
import { exhibirPartidaAction } from "./actions";
import { FechaHoraExhibicion } from "./FechaHoraExhibicion";

export function FormularioExhibir({
  idPartida,
  idExhibidora,
  textoBoton,
  checkboxUltimaBacha,
}: {
  idPartida: number;
  idExhibidora: number;
  textoBoton: string;
  checkboxUltimaBacha?: { label: string; hint: boolean };
}) {
  const [state, formAction, pending] = useActionState(exhibirPartidaAction, undefined);
  const [marcarUltima, setMarcarUltima] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        // Sin <form action>: React 19 resetearía los campos al terminar, también con error.
        e.preventDefault();
        if (pending) return;
        const datos = new FormData(e.currentTarget);
        startTransition(() => formAction(datos));
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="idPartida" value={idPartida} />
      <input type="hidden" name="idExhibidora" value={idExhibidora} />

      {checkboxUltimaBacha && (
        <label className="flex items-start gap-2 text-[11px] text-ink-soft">
          <input
            type="checkbox"
            name="oficializarCambioAhora"
            checked={marcarUltima}
            onChange={(e) => setMarcarUltima(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {checkboxUltimaBacha.label}
            {checkboxUltimaBacha.hint && (
              <span className="block text-ok">No quedan más bachas pendientes de este sabor.</span>
            )}
          </span>
        </label>
      )}

      <FechaHoraExhibicion />

      {state?.error && (
        <p role="alert" className="rounded-lg bg-bad-tint px-2.5 py-1.5 text-[11px] font-medium text-bad">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
      >
        {pending ? "Exhibiendo..." : textoBoton}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Baja de bacha**

`src/app/(app)/exhibir/BajaBacha.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useState } from "react";
import { darDeBajaBachaAction } from "./actions";

export function BajaBacha({ idPartida, descripcion }: { idPartida: number; descripcion: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [observacion, setObservacion] = useState("");
  const [state, formAction, pending] = useActionState(darDeBajaBachaAction, undefined);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="self-start text-xs font-medium text-ink-soft transition-colors hover:text-bad"
      >
        Dar de baja
      </button>
    );
  }

  const completo = motivo !== "" && observacion.trim() !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !completo) return;
        const datos = new FormData(e.currentTarget);
        startTransition(() => formAction(datos));
      }}
      className="flex flex-col gap-2 rounded-lg border border-border p-2.5"
    >
      <input type="hidden" name="idPartida" value={idPartida} />
      <p className="text-[11px] font-medium text-ink">Dar de baja la bacha de {descripcion}</p>

      <select
        name="motivo"
        required
        aria-label="Motivo de la baja"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-base text-ink sm:text-xs"
      >
        <option value="">Motivo...</option>
        <option value="scrap">Scrap (descarte)</option>
        <option value="vencido">Vencido</option>
        <option value="ajuste">Ajuste de stock</option>
      </select>

      <textarea
        name="observacion"
        required
        rows={2}
        aria-label="Observación de la baja"
        placeholder="¿Qué pasó con la bacha?"
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
        className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-base text-ink sm:text-xs"
      />

      {state?.error && (
        <p role="alert" className="rounded-lg bg-bad-tint px-2.5 py-1.5 text-[11px] font-medium text-bad">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !completo}
          className="rounded-lg bg-bad px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Confirmar baja"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs font-medium text-ink-soft hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Usar los componentes en `ExhibirSlot.tsx`**

En `src/app/(app)/exhibir/ExhibirSlot.tsx`:

1. Imports: sacá `import { exhibirPartidaAction } from "./actions";` y agregá `import { FormularioExhibir } from "./FormularioExhibir";` y `import { BajaBacha } from "./BajaBacha";`.
2. En `BachasDeSabor`: borrá el estado `marcarUltima` (`const [marcarUltima, setMarcarUltima] = useState(false);`).
3. Reemplazá el bloque `<form action={exhibirPartidaAction} ...> ... </form>` completo por:

```tsx
      <FormularioExhibir
        key={selected.idPartida}
        idPartida={selected.idPartida}
        idExhibidora={idExhibidora}
        textoBoton={incumpleFifo ? "Exhibir de todos modos" : "Exhibir"}
        checkboxUltimaBacha={checkboxUltimaBacha}
      />

      <div className="mt-2">
        <BajaBacha
          key={selected.idPartida}
          idPartida={selected.idPartida}
          descripcion={`${selected.cantidad} kg · ${formatFecha(selected.fechaFab)}`}
        />
      </div>
```

(`useState` sigue usándose para `selectedId`; dejá el import.)

- [ ] **Step 5: Usar los componentes en `ExhibirGroup.tsx`**

En `src/app/(app)/exhibir/ExhibirGroup.tsx`:

1. Imports: sacá `exhibirPartidaAction` y agregá `FormularioExhibir` y `BajaBacha` (mismas rutas relativas que arriba).
2. Reemplazá el bloque `{selected.idExhibidoraDestino ? ( <form ...> ... </form> ) : ( <span ...>Sin slot ...</span> )}` por:

```tsx
      {selected.idExhibidoraDestino ? (
        <FormularioExhibir
          key={selected.idPartida}
          idPartida={selected.idPartida}
          idExhibidora={selected.idExhibidoraDestino}
          textoBoton={incumpleFifo ? "Exhibir de todos modos" : "Exhibir"}
        />
      ) : (
        <span className="rounded-full bg-warn-tint px-2 py-0.5 text-[10px] font-semibold text-warn">
          Sin slot de exhibidora asignado
        </span>
      )}

      <div className="mt-2">
        <BajaBacha
          key={selected.idPartida}
          idPartida={selected.idPartida}
          descripcion={`${selected.cantidad} kg · ${formatFecha(selected.fechaFab)}`}
        />
      </div>
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit` — Expected: 0 errores.
Run: `npx eslint "src/app/(app)/exhibir"` — Expected: 0 errores (sin `react-hooks/set-state-in-effect`).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/exhibir/FechaHoraExhibicion.tsx" "src/app/(app)/exhibir/FormularioExhibir.tsx" "src/app/(app)/exhibir/BajaBacha.tsx" "src/app/(app)/exhibir/ExhibirSlot.tsx" "src/app/(app)/exhibir/ExhibirGroup.tsx"
git commit -m "feat: exhibir con fecha y hora editables y dar de baja bachas desde Exhibir"
```

---

### Task 5: Auditoría muestra la observación de la baja

**Files:**
- Modify: `src/app/(app)/auditoria/page.tsx`

- [ ] **Step 1: Mostrar la observación**

En `src/app/(app)/auditoria/page.tsx`, en la sección "Cierres de remanente recientes":

1. Cambiá el título `Cierres de remanente recientes` por `Bajas de stock recientes`.
2. Dentro de cada tarjeta (`cierres.map((c) => ...)`), justo después del `<div className="font-mono ...">` que muestra motivo, hora y usuario, agregá:

```tsx
                  {c.observacion && (
                    <div
                      className="line-clamp-2 break-words text-[10.5px] text-ink-soft"
                      title={c.observacion}
                    >
                      {c.observacion}
                    </div>
                  )}
```

3. Cambiá el texto vacío `Sin cierres registrados.` por `Sin bajas registradas.`

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` — Expected: 0 errores. Run: `npx eslint "src/app/(app)/auditoria/page.tsx"` — Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/auditoria/page.tsx"
git commit -m "feat: mostrar la observacion de las bajas en auditoria"
```

---

### Task 6: Cierre de PCP sin destildar bachas

**Files:**
- Modify: `src/lib/pcp/cierre-queries.ts`
- Modify: `src/lib/pcp/cierre-queries.test.ts`
- Modify: `src/app/(app)/pcp/cierre-actions.ts`
- Modify: `src/app/(app)/pcp/CierreDiaForm.tsx`

- [ ] **Step 1: Actualizar los tests (quitar `ausentes`)**

En `src/lib/pcp/cierre-queries.test.ts` buscá todas las apariciones de `ausentes` y:

1. En el helper `entradaCierre`, quitá `ausentes: []` (la propiedad deja de existir en `ConfirmarCierreInput`).
2. **Borrá** los tests que prueban la baja de bachas en el cierre: el de "las bachas del obrador destildadas quedan con baja por ajuste y no cuentan como stock" y el de "ausente ya exhibido / inexistente no recibe baja" (nombres aproximados: buscá por `ausentes`).
3. En el test de **rollback real** (falla dentro de la transacción con una demanda enorme): quitá `ausentes: [e.obrador]` y el chequeo de que la bacha "no quedó con baja". Conservá la aserción de que quedan en 0 las tablas del cierre: la falla ocurre al insertar la OP, **después** de insertar `f_cierre_dia` y `f_cierre_dia_bacha`, así que el rollback sigue probado.
4. En los tests de validación de forma, quitá el caso "`ausentes` que no es una lista".
5. Ajustá los tests que dependían de `ausentes` para el stock del obrador (si alguno restaba una bacha ausente del cálculo, rehacelo sin ausente y recalculá el valor esperado a mano).

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: FAIL por tipos/compilación o por comportamiento viejo (el código de producción todavía acepta `ausentes`), o PASS si vitest no tipa; en ambos casos continuá con el Step 2.

- [ ] **Step 2: Quitar `ausentes` de `cierre-queries.ts`**

En `src/lib/pcp/cierre-queries.ts`:

1. En `ConfirmarCierreInput` borrá `ausentes: number[];` y su comentario.
2. En `validarEntrada` borrá la condición `!Array.isArray(input.ausentes) ||`.
3. `armarStockSabores` pasa a no recibir ausentes:

```ts
// Stock de PT por sabor: obrador + exhibida ponderada por su %.
function armarStockSabores(
  datos: DatosCierre,
  pctPorPartida: Map<number, number>
): Record<number, StockSabor> {
  const stockSabores: Record<number, StockSabor> = {};
  const stockDe = (idProd: number): StockSabor =>
    (stockSabores[idProd] ??= { kgObrador: 0, kgExhibidaPonderada: 0 });
  for (const b of datos.bachasObrador) {
    stockDe(b.idProd).kgObrador += b.cantidad;
  }
  for (const b of datos.bachasExhibidas) {
    stockDe(b.idProd).kgExhibidaPonderada += (b.cantidad * (pctPorPartida.get(b.idPartida) as number)) / 100;
  }
  return stockSabores;
}
```

4. En `confirmarCierre`: borrá las constantes `idsObrador` y `ausentes`, cambiá la llamada a `armarStockSabores(datos, pctPorPartida as Map<number, number>)`, y borrá completo el bloque `if (ausentes.size > 0) { ... UPDATE ... 'ajuste' ... }`.

- [ ] **Step 3: Quitar `ausentes` de la action**

En `src/app/(app)/pcp/cierre-actions.ts`: borrá `ausentes: number[];` de `PayloadCierre` y la línea `ausentes: payload.ausentes ?? [],` de la llamada a `confirmarCierre`.

- [ ] **Step 4: Lista de solo lectura en `CierreDiaForm.tsx`**

En `src/app/(app)/pcp/CierreDiaForm.tsx`:

1. Borrá el estado `ausentes` (`const [ausentes, setAusentes] = ...`), sacalo de las dependencias del `useMemo` de `stockSabores` (que pasa a sumar **todas** las bachas del obrador: `de(b.idProd).kgObrador += b.cantidad;` sin condición) y del `payload` (borrá la línea `ausentes: Array.from(ausentes),`).
2. Reemplazá el contenido del bloque "1. Bachas del obrador" (la `Seccion` con las casillas) por una lista de solo lectura y el aviso:

```tsx
      <Seccion
        titulo="1. Bachas del obrador"
        ayuda="Bachas terminadas que todavía no salieron a la exhibidora. Se cuentan todas como stock."
      >
        {datos.bachasObrador.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay bachas esperando en el obrador.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from(obradorPorSabor.entries()).map(([idProd, grupo]) => (
              <div key={idProd}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{grupo.detalle}</p>
                <ul className="flex flex-col gap-1 text-sm text-ink">
                  {grupo.bachas.map((b) => (
                    <li key={b.idPartida} className="flex items-center gap-2">
                      <span className="font-mono">{fmt(b.cantidad)} kg</span>
                      <span className="text-ink-soft">lote {b.lote}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 rounded-lg bg-warn-tint px-3 py-2 text-xs font-medium text-warn">
          ¿Falta alguna bacha? Exhibila o dala de baja desde{" "}
          <Link href="/exhibir" className="font-semibold underline">
            Exhibir
          </Link>{" "}
          y volvé a cargar esta pantalla.
        </p>
      </Seccion>
```

(Mantené la agrupación por `idProd` que ya existe en `obradorPorSabor`; si la estructura del `Map` es distinta, adaptá el `map` de arriba a ella. `Link` ya está importado en el archivo.)
3. Si `useState` queda importado pero ya no se usa en algo que no sea el estado de otras partes, no lo toques (se sigue usando para `pcts`, `stockReal`, etc.).

- [ ] **Step 5: Correr tests, tipos y lint**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: 0 errores. Run: `npx eslint src/lib/pcp "src/app/(app)/pcp"` — Expected: 0 errores.
Verificá (mutación, sin commitear): reemplazá temporalmente `withTransaction` por una ejecución sin transacción en `confirmarCierre` y confirmá que el test de rollback real **falla**; restaurá el código.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pcp/cierre-queries.ts src/lib/pcp/cierre-queries.test.ts "src/app/(app)/pcp/cierre-actions.ts" "src/app/(app)/pcp/CierreDiaForm.tsx"
git commit -m "feat: el cierre de PCP deja de destildar bachas y avisa que se resuelvan desde Exhibir"
```

---

### Task 7: Verificación final

**Files:** ninguno (solo verificación; si encontrás un bug, corregilo con su test y commiteá aparte).

- [ ] **Step 1: Suite completa**

Run: `npm run test:db`
Expected: todos los archivos pasan. La suite vacía productos, recetas, exhibidora y partidas: es esperado.

- [ ] **Step 2: Lint y tipos**

Run: `npm run lint` — Expected: 0 errores. Run: `npx tsc --noEmit` — Expected: 0 errores.

- [ ] **Step 3: Restaurar el catálogo**

```bash
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/import-historico.ts
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/import-recetas.ts
```

Expected: 53 productos, 24 posiciones, 36 recetas, 7862 partidas.

- [ ] **Step 4: Verificación manual en el navegador (cuenta de prueba)**

Levantá el servidor con `preview_start` (config `malaga-soft`; el puerto puede variar). Creá una cuenta temporal con `npm run create-user` (rol admin, `qa-temp-bachas@test.local`, contraseña aleatoria). El catálogo importado probablemente no tiene bachas sin exhibir: con un script temporal insertá 3 partidas PT sin exhibir (`ts_exhibicion` nulo) para un sabor de la cartilla, con `fecha_fab` de hace 3 días, y borralas al final. Verificá:

1. `/exhibir`: bajo "Exhibir" aparece "Fecha y hora: ahora · Cambiar". Exhibir sin tocar nada guarda la hora actual.
2. "Cambiar" abre un campo con la hora actual cargada; elegir una fecha de ayer y exhibir: en la base `ts_exhibicion` es esa fecha (hora de Málaga).
3. Elegir una fecha futura o anterior a la fabricación: muestra el error claro y conserva lo cargado (incluida la fecha elegida).
4. "Usar ahora" vuelve al modo normal.
5. "Dar de baja" abre el formulario; "Confirmar baja" sigue deshabilitado hasta tener motivo y observación; al confirmar, la bacha desaparece de Exhibir.
6. `/auditoria`: la baja aparece en "Bajas de stock recientes" con producto, motivo, observación, usuario y hora; "Deshacer" la revierte (vuelve a aparecer en Exhibir).
7. `/pcp` (Cierre del día): el bloque 1 es una lista sin casillas, con el aviso y el link a Exhibir; el cierre se puede completar y confirmar normalmente.
8. Sin errores en la consola del navegador.

- [ ] **Step 5: Limpieza**

Borrá las partidas de prueba, las exhibiciones/bajas de la prueba (volviendo a correr los dos imports del Step 3 se restaura todo), la cuenta temporal y sus sesiones (primero `malaga.sesiones`), y los cierres/OPs de prueba si hiciste uno (`TRUNCATE malaga.f_cierre_dia_base, malaga.f_cierre_dia_sabor, malaga.f_cierre_dia_bacha, malaga.f_cierre_dia CASCADE`). Confirmá que `malaga.usuarios` quedó como antes (las 8 cuentas reales más `t@t.com`), que el catálogo está completo (53 / 36 / 24 / 7862), que no quedaron scripts temporales en `scripts/` y detené el servidor.

- [ ] **Step 6: Estado del repositorio**

Run: `git status --short` y `git log --oneline -10`
Expected: los commits de los Tasks 1 a 6 presentes; sin cambios sin commitear salvo `.claude/`.

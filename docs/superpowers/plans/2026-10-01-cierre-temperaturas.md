# Cierre y edición de temperaturas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar al módulo de Temperaturas un cierre/firma diario formal (que bloquea toda escritura del día una vez firmado, y puede reabrirse) y la edición in-place de un registro ya cargado, reemplazando el bloqueo actual de "segundo registro del mismo punto/día".

**Architecture:** Una tabla nueva `malaga.f_cierre_temperaturas` (una fila por día cerrado, PK `fecha`) decide si el día está abierto o cerrado. `registrarTemperatura` pasa de INSERT-que-rechaza-duplicado a INSERT ... ON CONFLICT (upsert), controlado por un chequeo previo de cierre; `deshacerRegistroTemperatura` chequea el cierre del día **del registro que se está borrando** (no necesariamente "hoy"). Dos server actions nuevas, sin argumentos, envuelven `cerrarDia`/`reabrirDia`. La UI existente (`GrillaTemperaturas`) pasa a mostrar siempre el formulario de carga (precargado) mientras el día esté abierto, y un componente nuevo (`CierreDiaControls`) muestra el estado del día y los botones de cerrar/reabrir.

**Tech Stack:** Next.js 16 App Router, TypeScript, Postgres (raw SQL vía `src/lib/db.ts`), node-pg-migrate, vitest (`npm run test:db`), `useActionState` para los formularios.

---

## Contexto para quien implemente

- El módulo de Temperaturas ya está en producción. Los archivos relevantes son:
  - [src/lib/temperaturas/queries.ts](src/lib/temperaturas/queries.ts) — toda la lógica de datos.
  - [src/lib/temperaturas/queries.test.ts](src/lib/temperaturas/queries.test.ts) — tests contra la base real (requiere `RUN_DESTRUCTIVE_DB_TESTS=true`).
  - [src/app/(app)/temperaturas/actions.ts](<src/app/(app)/temperaturas/actions.ts>) — server actions.
  - [src/app/(app)/temperaturas/GrillaTemperaturas.tsx](<src/app/(app)/temperaturas/GrillaTemperaturas.tsx>) — grilla + modal de carga/vista.
  - [src/app/(app)/temperaturas/page.tsx](<src/app/(app)/temperaturas/page.tsx>) — página del módulo.
  - [src/app/(app)/page.tsx](<src/app/(app)/page.tsx>) — Inicio, con el banner de recordatorio.
- **No hay base de datos de test aislada.** `npm run test:db` corre contra la base real compartida. `vitest.config.ts` ya tiene `fileParallelism: false` para que los tests de distintos archivos no corran en paralelo (evita condiciones de carrera al truncar tablas). **Nunca** hacer `TRUNCATE` de `malaga.usuarios` — ya se arregló ese problema una vez. El patrón correcto, ya usado en `queries.test.ts`, es: truncar las tablas propias del módulo en `beforeEach`, y en `afterEach` borrar puntualmente solo la fila de usuario de prueba (`t-temp@t.com`) de la tabla real `malaga.usuarios`, primero borrando cualquier fila que la referencie por FK.
- **Patrón de React obligatorio:** el cierre del modal en `GrillaTemperaturas.tsx` al guardar con éxito usa el patrón "ajustar estado durante el render" (comparar `state` contra `lastHandledState` dentro del cuerpo del componente), **no** `useEffect` — este proyecto tiene `react-hooks/set-state-in-effect` como error de ESLint. Cualquier código nuevo en ese archivo debe seguir el mismo patrón.
- Comandos:
  - Tests completos (destructivos, contra la base real): `npm run test:db`
  - Un archivo puntual: `npm run test:db -- src/lib/temperaturas/queries.test.ts`
  - Migraciones: `npm run migrate:up` / `npm run migrate:down`
  - Lint: `npm run lint`

---

## File Structure

- **Modify:** `migrations/` — nueva migración `1790800000000_create-f-cierre-temperaturas.js`.
- **Modify:** `src/lib/temperaturas/queries.ts` — nuevas funciones `getCierreHoy`, `cerrarDia`, `reabrirDia`; se reescriben `registrarTemperatura` y `deshacerRegistroTemperatura`.
- **Modify:** `src/lib/temperaturas/queries.test.ts` — nuevo truncado, nuevo `afterEach`, tests nuevos/reemplazados.
- **Modify:** `src/app/(app)/temperaturas/actions.ts` — nuevas actions `cerrarDiaTemperaturasAction`, `reabrirDiaTemperaturasAction`.
- **Create:** `src/app/(app)/temperaturas/CierreDiaControls.tsx` — banner de estado del día + botones cerrar/reabrir.
- **Modify:** `src/app/(app)/temperaturas/GrillaTemperaturas.tsx` — edición in-place, recibe `cerrado`.
- **Modify:** `src/app/(app)/temperaturas/page.tsx` — trae `getCierreHoy`, renderiza `CierreDiaControls`, pasa `cerrado` a la grilla.
- **Modify:** `src/app/(app)/page.tsx` — banner de 3 estados.

---

### Task 1: Migración — tabla `f_cierre_temperaturas` + constraint única en registros

**Files:**
- Create: `migrations/1790800000000_create-f-cierre-temperaturas.js`

- [ ] **Step 1: Escribir la migración**

```js
exports.up = (pgm) => {
  pgm.sql(`
    DROP INDEX malaga.idx_registro_temperaturas_punto_fecha;

    ALTER TABLE malaga.f_registro_temperaturas
      ADD CONSTRAINT uq_registro_temperaturas_punto_fecha UNIQUE (id_punto, fecha);

    CREATE TABLE malaga.f_cierre_temperaturas (
      fecha DATE PRIMARY KEY,
      ts_cierre TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_cierre INTEGER NOT NULL REFERENCES malaga.usuarios(id_user)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.f_cierre_temperaturas;

    ALTER TABLE malaga.f_registro_temperaturas
      DROP CONSTRAINT uq_registro_temperaturas_punto_fecha;

    CREATE INDEX idx_registro_temperaturas_punto_fecha ON malaga.f_registro_temperaturas(id_punto, fecha);
  `);
};
```

La constraint única reemplaza al índice no-único existente porque `registrarTemperatura` (Task 3) va a necesitar un `ON CONFLICT (id_punto, fecha)`, que requiere que esas columnas tengan una constraint única o un índice único — un índice simple no alcanza.

- [ ] **Step 2: Aplicar la migración**

Run: `npm run migrate:up`
Expected: salida mencionando `1790800000000_create-f-cierre-temperaturas` como aplicada, sin errores.

- [ ] **Step 3: Verificar a mano que la tabla y la constraint existen**

Run (ejemplo con `psql` o el cliente que uses contra la base real):
```sql
\d malaga.f_cierre_temperaturas
\d malaga.f_registro_temperaturas
```
Expected: `f_cierre_temperaturas` con columnas `fecha` (PK), `ts_cierre`, `user_cierre`; `f_registro_temperaturas` muestra `uq_registro_temperaturas_punto_fecha` como constraint única y ya NO tiene `idx_registro_temperaturas_punto_fecha`.

- [ ] **Step 4: Commit**

```bash
git add migrations/1790800000000_create-f-cierre-temperaturas.js
git commit -m "feat: agregar tabla f_cierre_temperaturas y constraint unica para upsert de registros"
```

---

### Task 2: `getCierreHoy`, `cerrarDia`, `reabrirDia`

**Files:**
- Modify: `src/lib/temperaturas/queries.ts`
- Test: `src/lib/temperaturas/queries.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/temperaturas/queries.test.ts`, agregar `getCierreHoy`, `cerrarDia`, `reabrirDia` al import existente:

```ts
import {
  listPuntos,
  getConfigTemperaturas,
  updateConfigTemperaturas,
  listPuntosConEstadoHoy,
  registrarTemperatura,
  listHistorialReciente,
  getResumen30Dias,
  deshacerRegistroTemperatura,
  getCierreHoy,
  cerrarDia,
  reabrirDia,
} from "./queries";
```

Agregar este test al final del `describe`, antes del `});` de cierre:

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts -t "cerrarDia crea el cierre"`
Expected: FAIL — `getCierreHoy is not a function` (o similar, porque todavía no existe).

- [ ] **Step 3: Implementar las tres funciones**

En `src/lib/temperaturas/queries.ts`, agregar al final del archivo (después de `deshacerRegistroTemperatura`):

```ts
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts -t "cerrarDia crea el cierre"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/temperaturas/queries.ts src/lib/temperaturas/queries.test.ts
git commit -m "feat: agregar getCierreHoy, cerrarDia y reabrirDia"
```

---

### Task 3: `registrarTemperatura` pasa a editar en vez de bloquear, y rechaza si el día está cerrado

**Files:**
- Modify: `src/lib/temperaturas/queries.ts:94-113`
- Test: `src/lib/temperaturas/queries.test.ts`

- [ ] **Step 1: Reemplazar el test de bloqueo por uno de edición, y agregar el test de día cerrado**

En `src/lib/temperaturas/queries.test.ts`, **reemplazar por completo** el test `"registrarTemperatura bloquea un segundo registro del mismo punto el mismo día"` (líneas 103-112) por:

```ts
  it("registrarTemperatura edita el valor si el punto ya tiene registro de hoy y el día está abierto", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();

    const primero = await registrarTemperatura(punto.idPunto, -13.5, userRegistro);
    const segundo = await registrarTemperatura(punto.idPunto, -13.0, userRegistro);

    expect(segundo.idRegistro).toBe(primero.idRegistro);

    const fila = await query<{ temperatura: string }>(
      `SELECT temperatura FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [primero.idRegistro]
    );
    expect(fila.rows[0].temperatura).toBe("-13.0");

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) FROM malaga.f_registro_temperaturas WHERE id_punto = $1`,
      [punto.idPunto]
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("registrarTemperatura rechaza cargar o editar si el día ya está cerrado", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    await cerrarDia(userRegistro);

    await expect(registrarTemperatura(punto.idPunto, -13.0, userRegistro)).rejects.toThrow(
      "El día ya está cerrado y firmado. Reabrilo para poder cargar o editar."
    );
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts -t "registrarTemperatura"`
Expected: FAIL — el test de edición falla porque la implementación actual tira `"Ya se registró la temperatura de este punto hoy."` en vez de editar; el test de día cerrado falla porque no hay ningún chequeo de cierre todavía.

- [ ] **Step 3: Reescribir `registrarTemperatura`**

En `src/lib/temperaturas/queries.ts`, reemplazar la función completa (líneas 94-113):

```ts
export async function registrarTemperatura(
  idPunto: number,
  temperatura: number,
  userRegistro: number
): Promise<{ idRegistro: number }> {
  const cierre = await query(`SELECT 1 FROM malaga.f_cierre_temperaturas WHERE fecha = CURRENT_DATE`);
  if (cierre.rows.length > 0) {
    throw new Error("El día ya está cerrado y firmado. Reabrilo para poder cargar o editar.");
  }

  const result = await query<{ id_registro: number }>(
    `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro)
     VALUES ($1, $2, $3)
     ON CONFLICT (id_punto, fecha) DO UPDATE
       SET temperatura = EXCLUDED.temperatura, ts_registro = now(), user_registro = EXCLUDED.user_registro
     RETURNING id_registro`,
    [idPunto, temperatura, userRegistro]
  );
  return { idRegistro: result.rows[0].id_registro };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts -t "registrarTemperatura"`
Expected: PASS (los 4 tests de `registrarTemperatura`: inserta, edita, rechaza cerrado, y el ya existente "inserta el registro de hoy")

- [ ] **Step 5: Commit**

```bash
git add src/lib/temperaturas/queries.ts src/lib/temperaturas/queries.test.ts
git commit -m "feat: registrarTemperatura edita en vez de bloquear, rechaza si el dia esta cerrado"
```

---

### Task 4: `deshacerRegistroTemperatura` rechaza si el día de ESE registro está cerrado

**Files:**
- Modify: `src/lib/temperaturas/queries.ts:185-187`
- Test: `src/lib/temperaturas/queries.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar en `src/lib/temperaturas/queries.test.ts`, después de `"deshacerRegistroTemperatura borra el registro y libera el punto para hoy"`:

```ts
  it("deshacerRegistroTemperatura rechaza si el día de ese registro está cerrado", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    const { idRegistro } = await registrarTemperatura(punto.idPunto, -13.0, userRegistro);

    await cerrarDia(userRegistro);

    await expect(deshacerRegistroTemperatura(idRegistro)).rejects.toThrow(
      "No se puede deshacer: el día de ese registro está cerrado y firmado."
    );

    const fila = await query(`SELECT 1 FROM malaga.f_registro_temperaturas WHERE id_registro = $1`, [idRegistro]);
    expect(fila.rows).toHaveLength(1);
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts -t "deshacerRegistroTemperatura rechaza"`
Expected: FAIL — hoy `deshacerRegistroTemperatura` borra sin chequear nada, así que no tira ningún error.

- [ ] **Step 3: Reescribir `deshacerRegistroTemperatura`**

En `src/lib/temperaturas/queries.ts`, reemplazar la función completa (líneas 185-187):

```ts
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
```

Si el registro ya no existe (`fecha` es `undefined`), la función simplemente ejecuta el `DELETE` (no-op), igual que antes.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts -t "deshacerRegistroTemperatura"`
Expected: PASS (ambos tests: el de borrar normal y el de rechazo por cierre)

- [ ] **Step 5: Actualizar el `afterEach` para limpiar también `f_cierre_temperaturas`**

El `afterEach` actual solo limpia `f_registro_temperaturas` antes de borrar el usuario de prueba. Ahora que los tests de cierre insertan filas en `f_cierre_temperaturas` con `user_cierre` apuntando al mismo usuario de prueba, hay que borrarlas también para no violar la FK al borrar el usuario. Reemplazar el `afterEach` completo:

```ts
  afterEach(async () => {
    // seedUser() inserta un usuario de prueba en la tabla REAL malaga.usuarios (compartida
    // con el resto del ERP); a diferencia del beforeEach de arriba, acá NO se hace TRUNCATE
    // de usuarios para no borrar cuentas reales. Se borra puntualmente sólo la fila de prueba,
    // junto con cualquier registro/cierre que la haya referenciado (FK), para poder
    // borrar el usuario sin violar la constraint.
    await query(
      `DELETE FROM malaga.f_registro_temperaturas WHERE user_registro IN (SELECT id_user FROM malaga.usuarios WHERE email = 't-temp@t.com')`
    );
    await query(
      `DELETE FROM malaga.f_cierre_temperaturas WHERE user_cierre IN (SELECT id_user FROM malaga.usuarios WHERE email = 't-temp@t.com')`
    );
    await query(`DELETE FROM malaga.usuarios WHERE email = 't-temp@t.com'`);
  });
```

También actualizar el `beforeEach` para truncar `f_cierre_temperaturas` junto con `f_registro_temperaturas`:

```ts
  beforeEach(async () => {
    await query("TRUNCATE malaga.f_registro_temperaturas, malaga.f_cierre_temperaturas RESTART IDENTITY CASCADE");
    await query(`UPDATE malaga.config_temperaturas SET temp_min = -14.0, temp_max = -12.0 WHERE id = 1`);
  });
```

- [ ] **Step 6: Correr el archivo completo de tests y verificar que todo pasa**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts`
Expected: PASS — todos los tests del archivo (los viejos y los nuevos).

- [ ] **Step 7: Commit**

```bash
git add src/lib/temperaturas/queries.ts src/lib/temperaturas/queries.test.ts
git commit -m "feat: deshacerRegistroTemperatura rechaza si el dia del registro esta cerrado"
```

---

### Task 5: Server actions `cerrarDiaTemperaturasAction` y `reabrirDiaTemperaturasAction`

**Files:**
- Modify: `src/app/(app)/temperaturas/actions.ts`

No lleva test automatizado propio (es una capa fina sobre `cerrarDia`/`reabrirDia`, ya cubiertas en Task 2); se verifica manualmente en el navegador en la Task 8.

- [ ] **Step 1: Agregar las dos actions**

En `src/app/(app)/temperaturas/actions.ts`, actualizar el import y agregar las funciones al final del archivo:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import {
  registrarTemperatura,
  updateConfigTemperaturas,
  cerrarDia,
  reabrirDia,
} from "@/lib/temperaturas/queries";
```

(el resto del archivo —`registrarTemperaturaAction` y `actualizarConfigTemperaturasAction`— queda igual)

```ts
export async function cerrarDiaTemperaturasAction(
  _prevState: { error?: string } | undefined,
  _formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  try {
    await cerrarDia(user.idUser);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo cerrar el día." };
  }

  revalidatePath("/temperaturas");
  revalidatePath("/");
  return {};
}

export async function reabrirDiaTemperaturasAction(
  _prevState: { error?: string } | undefined,
  _formData: FormData
) {
  await requireRole(["gestion", "admin"]);

  try {
    await reabrirDia();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo reabrir el día." };
  }

  revalidatePath("/temperaturas");
  revalidatePath("/");
  return {};
}
```

- [ ] **Step 2: Verificar que el proyecto compila sin errores de tipos**

Run: `npm run lint`
Expected: sin errores nuevos relacionados a `actions.ts` (puede haber warnings preexistentes no relacionados; si los hay, confirmar que ya existían antes de este cambio).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/temperaturas/actions.ts"
git commit -m "feat: agregar actions para cerrar y reabrir el dia de temperaturas"
```

---

### Task 6: Componente `CierreDiaControls`

**Files:**
- Create: `src/app/(app)/temperaturas/CierreDiaControls.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useActionState } from "react";
import { cerrarDiaTemperaturasAction, reabrirDiaTemperaturasAction } from "./actions";
import { formatFechaHora } from "@/lib/formatDate";
import type { CierreTemperaturas } from "@/lib/temperaturas/queries";

export function CierreDiaControls({
  cierre,
  puedeReabrir,
  completos,
  total,
}: {
  cierre: CierreTemperaturas | null;
  puedeReabrir: boolean;
  completos: number;
  total: number;
}) {
  const [cerrarState, cerrarAction, cerrarPending] = useActionState(cerrarDiaTemperaturasAction, undefined);
  const [reabrirState, reabrirAction, reabrirPending] = useActionState(reabrirDiaTemperaturasAction, undefined);

  if (cierre) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ok-tint p-3 text-sm text-ok">
        <span>
          Cerrado — firmado por {cierre.userCierre} el {formatFechaHora(cierre.tsCierre)}.
        </span>
        {puedeReabrir && (
          <form action={reabrirAction}>
            <button
              type="submit"
              disabled={reabrirPending}
              className="rounded-md border border-ok px-3 py-1.5 text-xs font-semibold text-ok transition-colors hover:bg-ok hover:text-white disabled:opacity-60"
            >
              {reabrirPending ? "Reabriendo..." : "Reabrir día"}
            </button>
          </form>
        )}
        {reabrirState?.error && <p className="w-full text-xs text-bad">{reabrirState.error}</p>}
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-raised p-3 text-sm text-ink">
      <span className="text-ink-soft">
        {completos} de {total} temperaturas cargadas hoy.
      </span>
      <form action={cerrarAction}>
        <button
          type="submit"
          disabled={cerrarPending}
          className="rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
        >
          {cerrarPending ? "Cerrando..." : "Cerrar y firmar el día"}
        </button>
      </form>
      {cerrarState?.error && <p className="w-full text-xs text-bad">{cerrarState.error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores en `CierreDiaControls.tsx`. Es esperable un error de tipos temporal porque `CierreTemperaturas` ya existe (Task 2) pero el componente todavía no se usa en ningún lado — eso es normal hasta la Task 8.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/temperaturas/CierreDiaControls.tsx"
git commit -m "feat: agregar componente CierreDiaControls"
```

---

### Task 7: `GrillaTemperaturas` — edición in-place y bloqueo visual cuando el día está cerrado

**Files:**
- Modify: `src/app/(app)/temperaturas/GrillaTemperaturas.tsx`

- [ ] **Step 1: Reescribir el componente completo**

Reemplazar todo el contenido de `src/app/(app)/temperaturas/GrillaTemperaturas.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { registrarTemperaturaAction } from "./actions";
import type { PuntoConEstadoHoy } from "@/lib/temperaturas/queries";

function Celda({ punto, onTap }: { punto?: PuntoConEstadoHoy; onTap?: (idPunto: number) => void }) {
  if (!punto) {
    return <div className="h-12 rounded-md border border-border bg-surface" />;
  }
  return (
    <button
      type="button"
      onClick={() => onTap?.(punto.idPunto)}
      className={`flex h-12 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
        punto.registradoHoy
          ? punto.fueraDeRangoHoy
            ? "border-bad bg-bad-tint text-bad"
            : "border-ok bg-ok-tint text-ok"
          : "border-warn bg-warn-tint text-warn hover:border-copper"
      }`}
    >
      {punto.registradoHoy ? `${punto.temperaturaHoy}°` : "Medir"}
    </button>
  );
}

function ExhibidoraGrid({
  numero,
  puntos,
  onTap,
}: {
  numero: number;
  puntos: PuntoConEstadoHoy[];
  onTap: (idPunto: number) => void;
}) {
  const obradorIzq = puntos.find((p) => p.exhibidora === numero && p.lado === "obrador" && p.posicion === "izquierda");
  const obradorDer = puntos.find((p) => p.exhibidora === numero && p.lado === "obrador" && p.posicion === "derecha");
  const clienteIzq = puntos.find((p) => p.exhibidora === numero && p.lado === "cliente" && p.posicion === "izquierda");
  const clienteDer = puntos.find((p) => p.exhibidora === numero && p.lado === "cliente" && p.posicion === "derecha");

  return (
    <div className="card p-4">
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Obrador</p>
      <div className="grid grid-cols-6 gap-1.5">
        <Celda punto={obradorIzq} onTap={onTap} />
        <Celda />
        <Celda />
        <Celda />
        <Celda />
        <Celda punto={obradorDer} onTap={onTap} />
      </div>
      <div className="mt-1.5 grid grid-cols-6 gap-1.5">
        <Celda punto={clienteIzq} onTap={onTap} />
        <Celda />
        <Celda />
        <Celda />
        <Celda />
        <Celda punto={clienteDer} onTap={onTap} />
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Lado Cliente</p>
      <p className="mt-1 text-center text-[11px] font-medium text-ink">Exhibidora {numero}</p>
    </div>
  );
}

export function GrillaTemperaturas({
  puntos,
  tempMin,
  tempMax,
  cerrado,
}: {
  puntos: PuntoConEstadoHoy[];
  tempMin: string;
  tempMax: string;
  cerrado: boolean;
}) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const abierto = puntos.find((p) => p.idPunto === abiertoId) ?? null;
  const [state, formAction, pending] = useActionState(registrarTemperaturaAction, undefined);

  // Cierra el modal cuando el registro se guarda con éxito. Se ajusta el estado
  // durante el render (en vez de en un efecto) siguiendo el patrón recomendado
  // por React para "adjusting state when a prop/state changes".
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state && !state.error) setAbiertoId(null);
  }

  const mostrarForm = abierto !== null && !cerrado;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExhibidoraGrid numero={1} puntos={puntos} onTap={setAbiertoId} />
        <ExhibidoraGrid numero={2} puntos={puntos} onTap={setAbiertoId} />
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAbiertoId(null)}
        >
          <div className="w-full max-w-sm card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="page-eyebrow mb-1">{abierto.detalle}</p>
                <h2 className="text-base font-semibold text-ink">
                  {mostrarForm
                    ? abierto.registradoHoy
                      ? "Editar temperatura"
                      : "Cargar temperatura"
                    : "Temperatura de hoy"}
                </h2>
              </div>
              <button type="button" onClick={() => setAbiertoId(null)} className="text-ink-soft hover:text-ink">
                ✕
              </button>
            </div>

            {mostrarForm ? (
              <form key={abierto.idPunto} action={formAction} className="flex flex-col gap-3">
                <input type="hidden" name="idPunto" value={abierto.idPunto} />
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Temperatura (°C)
                  <input
                    name="temperatura"
                    type="number"
                    step="0.1"
                    required
                    autoFocus
                    defaultValue={abierto.temperaturaHoy ?? ""}
                    className="rounded-md border border-border bg-surface-raised px-3 py-2"
                  />
                </label>
                <p className="text-[11px] text-ink-soft">
                  Rango normal: {tempMin}°C a {tempMax}°C
                </p>
                {state?.error && <p className="text-sm text-bad">{state.error}</p>}
                <button
                  type="submit"
                  disabled={pending}
                  className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Guardando..." : "Guardar"}
                </button>
              </form>
            ) : abierto.registradoHoy ? (
              <div
                className={`rounded-lg p-3 text-sm ${
                  abierto.fueraDeRangoHoy ? "bg-bad-tint text-bad" : "bg-ok-tint text-ok"
                }`}
              >
                {abierto.temperaturaHoy}°C
                {abierto.fueraDeRangoHoy ? " — fuera del rango normal" : " — dentro del rango normal"}
              </div>
            ) : (
              <p className="rounded-lg bg-surface-raised p-3 text-sm text-ink-soft">
                No se cargó este punto y el día ya está cerrado.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

Cambios respecto al original: nueva prop `cerrado`; `mostrarForm` decide si se ve el formulario (editable, precargado con `defaultValue`) o la vista de solo lectura; el `key={abierto.idPunto}` en el `<form>` fuerza que React monte un `<input>` nuevo (con su propio `defaultValue`) si en algún momento el modal pasa de un punto a otro sin desmontarse del todo; el título cambia entre "Cargar"/"Editar"/"Temperatura de hoy" según corresponda; y cuando el día está cerrado y el punto nunca se cargó, se muestra un mensaje en vez de dejar cargarlo.

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: error esperado de tipos en `src/app/(app)/temperaturas/page.tsx` porque todavía no le pasa la prop `cerrado` a `<GrillaTemperaturas>` — se corrige en la Task 8. Si el error aparece en otro lado, revisar.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/temperaturas/GrillaTemperaturas.tsx"
git commit -m "feat: GrillaTemperaturas permite editar in-place y respeta el dia cerrado"
```

---

### Task 8: `page.tsx` de /temperaturas — integrar cierre y controles

**Files:**
- Modify: `src/app/(app)/temperaturas/page.tsx`

- [ ] **Step 1: Actualizar la página**

Reemplazar todo el contenido de `src/app/(app)/temperaturas/page.tsx`:

```tsx
import { requireRole } from "@/lib/auth/requireRole";
import {
  listPuntosConEstadoHoy,
  getConfigTemperaturas,
  listHistorialReciente,
  getResumen30Dias,
  getCierreHoy,
} from "@/lib/temperaturas/queries";
import { formatFechaHora } from "@/lib/formatDate";
import { IconThermometer } from "@/components/icons";
import { GrillaTemperaturas } from "./GrillaTemperaturas";
import { ConfigTemperaturasForm } from "./ConfigTemperaturasForm";
import { CierreDiaControls } from "./CierreDiaControls";

export default async function TemperaturasPage() {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const [puntos, config, historial, resumen, cierre] = await Promise.all([
    listPuntosConEstadoHoy(),
    getConfigTemperaturas(),
    listHistorialReciente(),
    getResumen30Dias(),
    getCierreHoy(),
  ]);

  const puedeEditarRango = user.rol === "gestion" || user.rol === "admin";
  const completos = puntos.filter((p) => p.registradoHoy).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
          <IconThermometer className="h-4 w-4" />
        </span>
        <div>
          <p className="page-eyebrow leading-none">Vitrina</p>
          <h1 className="text-xl font-semibold text-ink">Temperaturas</h1>
        </div>
      </div>

      <div className="mb-6">
        {puedeEditarRango ? (
          <ConfigTemperaturasForm tempMin={config.tempMin} tempMax={config.tempMax} />
        ) : (
          <p className="text-xs text-ink-soft">
            Rango normal: {config.tempMin}°C a {config.tempMax}°C
          </p>
        )}
      </div>

      <CierreDiaControls cierre={cierre} puedeReabrir={puedeEditarRango} completos={completos} total={puntos.length} />

      <GrillaTemperaturas puntos={puntos} tempMin={config.tempMin} tempMax={config.tempMax} cerrado={cierre !== null} />

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Promedio y desvíos (últimos 30 días)</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {resumen.map((r) => (
            <div key={r.idPunto} className="card p-3">
              <div className="text-xs font-medium text-ink">{r.puntoDetalle}</div>
              <div className="mt-1 font-mono text-lg font-semibold text-ink">{r.promedio.toFixed(1)}°C</div>
              <div className="text-[10.5px] text-ink-soft">
                {r.desvios} desvío{r.desvios === 1 ? "" : "s"}
              </div>
            </div>
          ))}
          {resumen.length === 0 && (
            <p className="card py-6 text-center text-sm text-ink-soft sm:col-span-2 lg:col-span-4">
              Todavía no hay suficiente historial.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Historial reciente</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3.5 py-2.5">Punto</th>
                <th className="px-3.5 py-2.5 text-right">Temperatura</th>
                <th className="px-3.5 py-2.5">Cuándo</th>
                <th className="px-3.5 py-2.5">Quién</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h) => (
                <tr
                  key={h.idRegistro}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-3.5 py-2.5 font-medium text-ink">{h.puntoDetalle}</td>
                  <td
                    className={`px-3.5 py-2.5 text-right font-mono ${h.fueraDeRango ? "text-bad" : "text-ink-soft"}`}
                  >
                    {h.temperatura}°C
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-soft">{formatFechaHora(h.tsRegistro)}</td>
                  <td className="px-3.5 py-2.5 text-ink-soft">{h.userRegistro ?? "—"}</td>
                </tr>
              ))}
              {historial.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3.5 py-6 text-center text-ink-soft">
                    Todavía no hay registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Verificación manual en el navegador**

Levantar el servidor de desarrollo y entrar a `/temperaturas` logueado con un usuario `gestion` o `admin`:

1. Con el día abierto: tocar un punto sin cargar → debe verse el formulario vacío ("Cargar temperatura"). Cargar un valor → se guarda, el punto pasa a verde/rojo según rango.
2. Tocar el mismo punto de nuevo (ya cargado) → debe verse el formulario precargado con el valor actual ("Editar temperatura"), no la vista de solo lectura. Cambiar el valor y guardar → el punto se actualiza.
3. Click en "Cerrar y firmar el día" → aparece el banner verde "Cerrado — firmado por [tu email] el [fecha/hora]", desaparecen los controles de carga.
4. Tocar cualquier punto con el día cerrado → se ve solo lectura (valor si lo tiene, o el mensaje de "no se cargó y el día está cerrado" si no lo tiene) — no debe poder editarse ni cargarse nada.
5. Click en "Reabrir día" (solo visible para `gestion`/`admin`) → vuelve el banner de "N de 8 cargadas" y se puede volver a tocar/editar puntos.

Expected: los 5 pasos se comportan como se describe, sin errores en la consola del navegador.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/temperaturas/page.tsx"
git commit -m "feat: integrar cierre de dia y controles en la pagina de temperaturas"
```

---

### Task 9: Banner de Inicio con 3 estados

**Files:**
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Reescribir la página de Inicio**

Reemplazar todo el contenido de `src/app/(app)/page.tsx`:

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/requireRole";
import { listPuntosConEstadoHoy, getCierreHoy } from "@/lib/temperaturas/queries";

export default async function Home() {
  const user = await requireUser();
  const [puntos, cierre] = await Promise.all([listPuntosConEstadoHoy(), getCierreHoy()]);
  const faltan = puntos.filter((p) => !p.registradoHoy).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <h1 className="mb-2 text-xl font-semibold text-ink">Hola, {user.email}</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Elegí un módulo en el menú de la izquierda para empezar.
      </p>

      {!cierre && faltan > 0 && (
        <Link
          href="/temperaturas"
          className="block rounded-lg bg-warn-tint px-4 py-3 text-sm font-medium text-warn transition-colors hover:bg-warn-tint/80"
        >
          Faltan cargar {faltan} de 8 temperaturas de hoy — tocá para ir a Temperaturas.
        </Link>
      )}

      {!cierre && faltan === 0 && (
        <Link
          href="/temperaturas"
          className="block rounded-lg bg-warn-tint px-4 py-3 text-sm font-medium text-warn transition-colors hover:bg-warn-tint/80"
        >
          Las temperaturas de hoy están completas — falta cerrar y firmar el día.
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Verificación manual en el navegador**

En `/` (Inicio), con los 3 escenarios:
1. Día abierto, faltan puntos → banner amarillo "Faltan cargar N de 8...".
2. Día abierto, los 8 cargados → banner amarillo "Las temperaturas de hoy están completas — falta cerrar y firmar el día.".
3. Día cerrado → sin banner.

Expected: los 3 estados se ven correctamente al navegar entre `/` y `/temperaturas` cargando/cerrando/reabriendo.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: banner de inicio con 3 estados segun cierre de temperaturas"
```

---

### Task 10: Verificación final completa

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Correr la suite completa de tests destructivos**

Run: `npm run test:db`
Expected: todos los tests pasan, incluyendo los de `src/lib/temperaturas/queries.test.ts` nuevos y modificados, y el resto de la suite (exhibidora, quiebres, ordenes, recetas, stock, pcp, auth/session) sigue pasando sin romperse.

- [ ] **Step 2: Confirmar que las 8 cuentas reales sobrevivieron**

Run (ejemplo, usando un script puntual o el cliente de base que uses):
```sql
SELECT email, rol FROM malaga.usuarios ORDER BY email;
```
Expected: las 8 cuentas reales siguen presentes (ninguna fue tocada por los tests — los tests nuevos solo tocan `t-temp@t.com`, que el `afterEach` limpia).

- [ ] **Step 3: Restaurar datos reales si hiciera falta**

Si en algún paso de testing manual (Tasks 8/9) se cerró o cargó algo sobre cuentas o datos reales de forma que convenga dejarlos en el estado original, usar los scripts existentes:

Run: `tsx --env-file=.env scripts/import-usuarios.ts`
Expected: confirma que las 8 cuentas reales (con sus hashes reales) están intactas en la base.

- [ ] **Step 4: Lint final del proyecto completo**

Run: `npm run lint`
Expected: sin errores nuevos introducidos por este plan.

- [ ] **Step 5: Confirmar en el spec que los 5 puntos de "Testing" quedaron cubiertos**

Repasar `docs/superpowers/specs/2026-10-01-cierre-temperaturas-design.md`, sección "Testing":
- `registrarTemperatura` edita en vez de bloquear — cubierto en Task 3.
- Cualquier escritura sobre un día cerrado se rechaza — cubierto en Tasks 3 y 4 (registrar/editar y deshacer); verificado manualmente en Task 8 para la UI.
- Cerrar el día funciona con 0, algunos o los 8 puntos — `cerrarDia` no valida cantidad de puntos cargados, así que funciona en cualquier estado; confirmar esto manualmente repitiendo el paso 3 de Task 8 con el día recién empezado (0 puntos cargados).
- Reabrir libera el día — cubierto en Task 2 y verificado manualmente en Task 8.
- Banner de Inicio con 3 estados — cubierto en Task 9.

- [ ] **Step 6: Commit final (si hubiera cambios pendientes de limpieza)**

```bash
git status
```

Si no hay cambios pendientes, no hace falta commitear nada más — el plan ya quedó commiteado tarea por tarea.

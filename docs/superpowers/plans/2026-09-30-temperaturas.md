# Registro de Temperaturas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily temperature-logging module for the 8 fixed measurement points (the 4 corners of each of the 2 display cases), with a non-blocking reminder banner, a tap-to-log grid UI, a history/summary view, and Auditoría-based undo.

**Architecture:** A brand-new domain (`src/lib/temperaturas/`), completely decoupled from `d_exhibidora` (flavor positions) — the 8 measurement points are a fixed, independently-seeded table describing the cooling equipment itself, not what flavor happens to be on display. One registration per point per day, enforced at the application layer (same pattern as the quiebres module's duplicate-blocking). The configurable acceptable range lives in a singleton-row table so it can be tuned without a code change. A server component grid (`/temperaturas`) lets staff tap any of the 8 points to log or review today's reading; Inicio shows a dismiss-free banner while any of today's 8 are still missing; Auditoría gets a new "undo" section for mistaken entries, following the exact same pattern already used there for exhibiciones/órdenes/cierres.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind v4, PostgreSQL via raw parameterized SQL (`src/lib/db.ts`), node-pg-migrate, Vitest (destructive DB tests gated by `RUN_DESTRUCTIVE_DB_TESTS=true`).

**Spec:** `docs/superpowers/specs/2026-09-30-temperaturas-design.md` — approved as written.

---

### Task 1: Migración de las 3 tablas

**Files:**
- Create: `migrations/<timestamp>_create-temperaturas-tables.js`

- [ ] **Step 1: Generar el archivo**

Run: `npm run migrate:create -- create-temperaturas-tables`

Reemplazar el scaffold ESM generado, entero, con (convención CommonJS de este proyecto):

```js
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
```

(`config_temperaturas`'s `CHECK (id = 1)` + fixed default hace que la tabla nunca pueda tener más de una fila — patrón estándar para una tabla de configuración singleton. El índice en `f_registro_temperaturas` es plano, no `UNIQUE` — el bloqueo de "un registro por punto por día" se hace a nivel aplicación en el Task 3, mismo criterio ya usado para los quiebres.)

- [ ] **Step 2: Correr la migración**

Run: `npm run migrate:up`
Expected: aplica limpio, sin errores.

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "Add temperaturas tables: puntos fijos, config de rango, registros"
```

---

### Task 2: Queries base — puntos, config, estado de hoy

**Files:**
- Create: `src/lib/temperaturas/queries.ts`
- Create: `src/lib/temperaturas/queries.test.ts`

- [ ] **Step 1: Escribir el módulo**

```ts
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
```

- [ ] **Step 2: Tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { listPuntos, getConfigTemperaturas, updateConfigTemperaturas, listPuntosConEstadoHoy } from "./queries";

describe("temperaturas queries — base", () => {
  beforeEach(async () => {
    await query("TRUNCATE malaga.f_registro_temperaturas RESTART IDENTITY CASCADE");
    await query(`UPDATE malaga.config_temperaturas SET temp_min = -14.0, temp_max = -12.0 WHERE id = 1`);
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
});
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx vitest run src/lib/temperaturas/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/temperaturas/
git commit -m "Add base temperaturas queries: puntos, config, estado de hoy"
```

---

### Task 3: Registrar una temperatura (con bloqueo de duplicado)

**Files:**
- Modify: `src/lib/temperaturas/queries.ts` (agregar función)
- Modify: `src/lib/temperaturas/queries.test.ts` (agregar tests)

- [ ] **Step 1: Agregar `registrarTemperatura`**

Al final de `src/lib/temperaturas/queries.ts`:

```ts
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
```

- [ ] **Step 2: Tests**

Agregar `registrarTemperatura` al import existente, y estos tests al final del `describe`:

```ts
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
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx vitest run src/lib/temperaturas/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/temperaturas/
git commit -m "Add registrarTemperatura with same-day duplicate blocking"
```

---

### Task 4: Historial, resumen de 30 días y deshacer

**Files:**
- Modify: `src/lib/temperaturas/queries.ts` (agregar funciones)
- Modify: `src/lib/temperaturas/queries.test.ts` (agregar tests)

- [ ] **Step 1: Agregar las funciones**

Al final de `src/lib/temperaturas/queries.ts`:

```ts
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
```

- [ ] **Step 2: Tests**

Agregar `listHistorialReciente`, `getResumen30Dias`, `deshacerRegistroTemperatura` al import existente, y estos tests al final del `describe`:

```ts
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
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx vitest run src/lib/temperaturas/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/temperaturas/
git commit -m "Add temperaturas history, 30-day summary and undo"
```

---

### Task 5: Ícono y navegación

**Files:**
- Modify: `src/components/icons.tsx`
- Modify: `src/app/(app)/navItems.ts`

- [ ] **Step 1: Agregar `IconThermometer`**

Al final de `src/components/icons.tsx`, después de `IconAlert`:

```tsx
export function IconThermometer(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5a2 2 0 0 0-2 2v9.09a3.5 3.5 0 1 0 4 0V5.5a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 2: Agregar la entrada de navegación**

En `src/app/(app)/navItems.ts`, agregar `IconThermometer` al import y una entrada nueva después de "Quiebres":

```ts
import {
  IconHome,
  IconTarget,
  IconBox,
  IconFlask,
  IconClipboard,
  IconLayers,
  IconStorefront,
  IconHistory,
  IconTrendUp,
  IconAlert,
  IconThermometer,
} from "@/components/icons";

export const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: IconHome },
  { href: "/planificacion", label: "Cartilla actual", icon: IconTarget },
  { href: "/pcp", label: "PCP", icon: IconTrendUp },
  { href: "/exhibir", label: "Exhibir", icon: IconStorefront },
  { href: "/quiebres", label: "Quiebres", icon: IconAlert },
  { href: "/temperaturas", label: "Temperaturas", icon: IconThermometer },
  { href: "/productos", label: "Productos", icon: IconBox },
  { href: "/recetas", label: "Recetas", icon: IconFlask },
  { href: "/ordenes", label: "Órdenes", icon: IconClipboard },
  { href: "/stock", label: "Stock", icon: IconLayers },
  { href: "/auditoria", label: "Auditoría", icon: IconHistory },
];
```

- [ ] **Step 3: Type-check y lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/icons.tsx src/app/\(app\)/navItems.ts
git commit -m "Add Temperaturas icon and nav entry"
```

---

### Task 6: Server actions

**Files:**
- Create: `src/app/(app)/temperaturas/actions.ts`

- [ ] **Step 1: Escribir las actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { registrarTemperatura, updateConfigTemperaturas } from "@/lib/temperaturas/queries";

export async function registrarTemperaturaAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPunto = Number(formData.get("idPunto"));
  const temperatura = Number(formData.get("temperatura"));

  if (!idPunto || Number.isNaN(temperatura)) {
    return { error: "Completá la temperatura." };
  }

  try {
    await registrarTemperatura(idPunto, temperatura, user.idUser);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo registrar la temperatura." };
  }

  revalidatePath("/temperaturas");
  revalidatePath("/");
  return {};
}

export async function actualizarConfigTemperaturasAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  await requireRole(["gestion", "admin"]);

  const tempMin = Number(formData.get("tempMin"));
  const tempMax = Number(formData.get("tempMax"));

  if (Number.isNaN(tempMin) || Number.isNaN(tempMax) || tempMin >= tempMax) {
    return { error: "El mínimo tiene que ser menor que el máximo." };
  }

  await updateConfigTemperaturas(tempMin, tempMax);
  revalidatePath("/temperaturas");
  return {};
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores (el archivo compila aunque todavía no lo use ninguna página, hasta el Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/temperaturas/actions.ts
git commit -m "Add temperaturas server actions"
```

---

### Task 7: Pantalla `/temperaturas`

**Files:**
- Create: `src/app/(app)/temperaturas/GrillaTemperaturas.tsx`
- Create: `src/app/(app)/temperaturas/ConfigTemperaturasForm.tsx`
- Create: `src/app/(app)/temperaturas/page.tsx`

- [ ] **Step 1: `GrillaTemperaturas.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
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

export function GrillaTemperaturas({ puntos, tempMin, tempMax }: { puntos: PuntoConEstadoHoy[]; tempMin: string; tempMax: string }) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const abierto = puntos.find((p) => p.idPunto === abiertoId) ?? null;
  const [state, formAction, pending] = useActionState(registrarTemperaturaAction, undefined);

  useEffect(() => {
    if (state && !state.error) setAbiertoId(null);
  }, [state]);

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
                  {abierto.registradoHoy ? "Temperatura de hoy" : "Cargar temperatura"}
                </h2>
              </div>
              <button type="button" onClick={() => setAbiertoId(null)} className="text-ink-soft hover:text-ink">
                ✕
              </button>
            </div>

            {abierto.registradoHoy ? (
              <div
                className={`rounded-lg p-3 text-sm ${
                  abierto.fueraDeRangoHoy ? "bg-bad-tint text-bad" : "bg-ok-tint text-ok"
                }`}
              >
                {abierto.temperaturaHoy}°C
                {abierto.fueraDeRangoHoy ? " — fuera del rango normal" : " — dentro del rango normal"}
              </div>
            ) : (
              <form action={formAction} className="flex flex-col gap-3">
                <input type="hidden" name="idPunto" value={abierto.idPunto} />
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Temperatura (°C)
                  <input
                    name="temperatura"
                    type="number"
                    step="0.1"
                    required
                    autoFocus
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
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: `ConfigTemperaturasForm.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { actualizarConfigTemperaturasAction } from "./actions";

export function ConfigTemperaturasForm({ tempMin, tempMax }: { tempMin: string; tempMax: string }) {
  const [state, formAction, pending] = useActionState(actualizarConfigTemperaturasAction, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-ink">
        Mínimo (°C)
        <input
          name="tempMin"
          type="number"
          step="0.1"
          required
          defaultValue={tempMin}
          className="w-24 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink">
        Máximo (°C)
        <input
          name="tempMax"
          type="number"
          step="0.1"
          required
          defaultValue={tempMax}
          className="w-24 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-copper hover:text-copper disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar rango"}
      </button>
      {state?.error && <p className="w-full text-xs text-bad">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: `page.tsx`**

```tsx
import { requireRole } from "@/lib/auth/requireRole";
import {
  listPuntosConEstadoHoy,
  getConfigTemperaturas,
  listHistorialReciente,
  getResumen30Dias,
} from "@/lib/temperaturas/queries";
import { formatFechaHora } from "@/lib/formatDate";
import { IconThermometer } from "@/components/icons";
import { GrillaTemperaturas } from "./GrillaTemperaturas";
import { ConfigTemperaturasForm } from "./ConfigTemperaturasForm";

export default async function TemperaturasPage() {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const [puntos, config, historial, resumen] = await Promise.all([
    listPuntosConEstadoHoy(),
    getConfigTemperaturas(),
    listHistorialReciente(),
    getResumen30Dias(),
  ]);

  const puedeEditarRango = user.rol === "gestion" || user.rol === "admin";

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

      <GrillaTemperaturas puntos={puntos} tempMin={config.tempMin} tempMax={config.tempMax} />

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

- [ ] **Step 4: Type-check y lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/temperaturas/
git commit -m "Add /temperaturas screen: grid, config, summary, history"
```

---

### Task 8: Banner de recordatorio en Inicio

**Files:**
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Reemplazar el archivo entero**

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/requireRole";
import { listPuntosConEstadoHoy } from "@/lib/temperaturas/queries";

export default async function Home() {
  const user = await requireUser();
  const puntos = await listPuntosConEstadoHoy();
  const faltan = puntos.filter((p) => !p.registradoHoy).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <h1 className="mb-2 text-xl font-semibold text-ink">Hola, {user.email}</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Elegí un módulo en el menú de la izquierda para empezar.
      </p>

      {faltan > 0 && (
        <Link
          href="/temperaturas"
          className="block rounded-lg bg-warn-tint px-4 py-3 text-sm font-medium text-warn transition-colors hover:bg-warn-tint/80"
        >
          Faltan cargar {faltan} de 8 temperaturas de hoy — tocá para ir a Temperaturas.
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check y lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: sin errores.

- [ ] **Step 3: Verificación manual**

Con una cuenta de prueba: entrar a Inicio sin haber cargado ninguna temperatura hoy — confirmar que aparece el banner "Faltan cargar 8 de 8...". Cargar una — confirmar que baja a "7 de 8". Cargar las 8 — confirmar que el banner desaparece.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/page.tsx
git commit -m "Add non-blocking reminder banner for missing daily temperaturas"
```

---

### Task 9: Deshacer desde Auditoría

**Files:**
- Modify: `src/app/(app)/auditoria/actions.ts`
- Modify: `src/app/(app)/auditoria/page.tsx`

- [ ] **Step 1: Agregar la action**

En `src/app/(app)/auditoria/actions.ts`, agregar el import y la función:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { deshacerExhibicion } from "@/lib/exhibidora/queries";
import { cancelarOrdenPlanificada, deshacerInicio, deshacerFinalizacion } from "@/lib/ordenes/queries";
import { deshacerCierreRemanente } from "@/lib/stock/queries";
import { deshacerRegistroTemperatura } from "@/lib/temperaturas/queries";

export async function deshacerExhibicionAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idPartida = Number(formData.get("idPartida"));
  if (!idPartida) return;

  await deshacerExhibicion(idPartida);
  revalidatePath("/auditoria");
  revalidatePath("/exhibir");
  revalidatePath("/stock");
}

export async function cancelarOrdenAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idOp = Number(formData.get("idOp"));
  if (!idOp) return;

  await cancelarOrdenPlanificada(idOp);
  revalidatePath("/auditoria");
  revalidatePath("/ordenes");
}

export async function deshacerInicioAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idOp = Number(formData.get("idOp"));
  if (!idOp) return;

  await deshacerInicio(idOp);
  revalidatePath("/auditoria");
  revalidatePath("/ordenes");
}

export async function deshacerFinalizacionAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idOp = Number(formData.get("idOp"));
  if (!idOp) return;

  await deshacerFinalizacion(idOp);
  revalidatePath("/auditoria");
  revalidatePath("/ordenes");
  revalidatePath("/stock");
}

export async function deshacerCierreAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idPartida = Number(formData.get("idPartida"));
  if (!idPartida) return;

  await deshacerCierreRemanente(idPartida);
  revalidatePath("/auditoria");
  revalidatePath("/stock");
}

export async function deshacerRegistroTemperaturaAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idRegistro = Number(formData.get("idRegistro"));
  if (!idRegistro) return;

  await deshacerRegistroTemperatura(idRegistro);
  revalidatePath("/auditoria");
  revalidatePath("/temperaturas");
  revalidatePath("/");
}
```

- [ ] **Step 2: Agregar la sección en `page.tsx`**

En `src/app/(app)/auditoria/page.tsx`, agregar los imports:

```ts
import { requireRole } from "@/lib/auth/requireRole";
import { listExhibicionesRecientes } from "@/lib/exhibidora/queries";
import { listOrdenesRecientes } from "@/lib/ordenes/queries";
import { listCierresRecientes } from "@/lib/stock/queries";
import { listHistorialReciente } from "@/lib/temperaturas/queries";
import { formatFechaHora } from "@/lib/formatDate";
import { IconHistory, IconStorefront, IconClipboard, IconFlask, IconThermometer } from "@/components/icons";
import {
  deshacerExhibicionAction,
  cancelarOrdenAction,
  deshacerInicioAction,
  deshacerFinalizacionAction,
  deshacerCierreAction,
  deshacerRegistroTemperaturaAction,
} from "./actions";
```

En la función `AuditoriaPage`, agregar `listHistorialReciente(15)` al `Promise.all` existente:

```ts
  const [exhibiciones, ordenes, cierres, registrosTemperatura] = await Promise.all([
    listExhibicionesRecientes(),
    listOrdenesRecientes(),
    listCierresRecientes(),
    listHistorialReciente(15),
  ]);
```

Y agregar esta sección nueva, después del `</div>` que cierra el `grid grid-cols-1 gap-6 xl:grid-cols-3` existente (o sea, como hermano de ese div, antes del `</div>` final que cierra la página):

```tsx
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <IconThermometer className="h-4 w-4 text-copper" />
          <h2 className="text-sm font-semibold text-ink">Registros de temperatura recientes</h2>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {registrosTemperatura.map((r) => (
            <div key={r.idRegistro} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-ink">{r.puntoDetalle}</div>
                <div className="font-mono text-[10.5px] text-ink-soft">
                  {r.temperatura}°C · {formatFechaHora(r.tsRegistro)}
                  {r.userRegistro ? ` · ${r.userRegistro}` : ""}
                  {r.fueraDeRango ? " · fuera de rango" : ""}
                </div>
              </div>
              <form action={deshacerRegistroTemperaturaAction} className="flex-none">
                <input type="hidden" name="idRegistro" value={r.idRegistro} />
                <button
                  type="submit"
                  className="whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-[10.5px] font-semibold text-ink-soft transition-colors hover:border-bad hover:text-bad"
                >
                  Deshacer
                </button>
              </form>
            </div>
          ))}
          {registrosTemperatura.length === 0 && (
            <p className="card py-6 text-center text-sm text-ink-soft">Sin registros de temperatura.</p>
          )}
        </div>
      </div>
```

- [ ] **Step 3: Type-check y lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Cargar una temperatura desde `/temperaturas`, ir a Auditoría, confirmar que aparece en "Registros de temperatura recientes", tocar "Deshacer", confirmar que desaparece de Auditoría y que en `/temperaturas` ese punto vuelve a estar disponible para cargar hoy.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/auditoria/
git commit -m "Add temperaturas undo to Auditoria"
```

---

### Task 10: Verificación completa

- [ ] **Step 1: Suite completa**

Run: `npm test` (esperado: todo bloqueado por el guard de `RUN_DESTRUCTIVE_DB_TESTS`, es lo esperado) y `npm run test:db`.
Expected: PASS en todos los archivos.

- [ ] **Step 2: Restaurar datos reales**

```bash
NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx tsx --env-file=.env scripts/import-historico.ts
NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx tsx --env-file=.env scripts/import-recetas.ts
```

Verificar conteos: 53 productos, 24 slots de cartilla, 36 recetas, 7862 partidas. Estos scripts no tocan `d_puntos_temperatura`/`config_temperaturas` (se siembran solos en la migración del Task 1) ni `malaga.usuarios` — recrear las 8 cuentas reales de personal una vez más si hace falta (mismo procedimiento ya usado en los checkpoints anteriores de este proyecto), dado que los tests destructivos de este checkpoint también truncan esa tabla.

- [ ] **Step 3: Walkthrough manual end-to-end**

Con una cuenta de prueba (crear y borrar al final): confirmar el banner en Inicio, cargar las 8 temperaturas desde `/temperaturas` (alguna dentro de rango, alguna fuera a propósito para ver el color de alerta), confirmar que el banner desaparece, revisar el resumen de 30 días y el historial, deshacer un registro desde Auditoría y confirmar que vuelve a estar disponible.

- [ ] **Step 4: Commit final (si hubo algún ajuste)**

```bash
git add -A
git commit -m "Modulo de temperaturas verificado end-to-end"
```

Si no hubo cambios de código durante la verificación, no hace falta este commit.

---

## Self-review notes

- **Cobertura del spec:** modelo de datos (puntos fijos + config + registros) → Task 1. Queries → Tasks 2-4. Carga con bloqueo de duplicado → Task 3. Rango configurable sin tocar código → Tasks 2 (`updateConfigTemperaturas`) y 6-7 (`ConfigTemperaturasForm`, solo gestion/admin). Grilla tocable con "Obrador"/"Lado Cliente" → Task 7. Recordatorio no bloqueante → Task 8. Historial + promedio + desvíos → Tasks 4 y 7. Deshacer desde Auditoría → Task 9.
- **Consistencia de tipos:** `PuntoConEstadoHoy` (Task 2) se usa sin cambios en `GrillaTemperaturas`/`page.tsx` (Task 7). `RegistroTemperatura` (Task 4) se usa sin cambios en `page.tsx` (Task 7) y en Auditoría (Task 9) — la misma función `listHistorialReciente` se reutiliza en ambos lugares con distinto `limite`, sin duplicar código.
- **Sin placeholders:** cada paso trae el código completo a escribir.

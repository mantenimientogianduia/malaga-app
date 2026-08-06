# Módulo PCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PCP (Planificación y Control de Producción) module: a demand-forecast engine that turns 8 weeks of exhibición history into "how much to produce tomorrow" for every sabor and base, reviewable and confirmable in one screen, plus a statistics dashboard that shares the same numbers.

**Architecture:** Two phases, each ending in a working, committed state. Fase 1 (tasks 1–17) is the calculation engine and the `/pcp` review-and-generate screen — usable end to end (creates real OPs) once done. Fase 2 (tasks 18–23) adds a second tab to the same `/pcp` page with trend charts, weather, and insights, reusing Fase 1's data functions. Pure math (regression, rounding, the necesario formula) lives in a DB-free module with plain `vitest` unit tests; everything that touches Postgres lives in `src/lib/pcp/queries.ts` with integration tests gated behind `RUN_DESTRUCTIVE_DB_TESTS`, following the project's existing pattern.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, PostgreSQL via raw parameterized SQL (`src/lib/db.ts`, no ORM), node-pg-migrate (CommonJS migrations), vitest, Tailwind v4 with the project's existing design tokens. No new npm dependencies — charts are hand-rolled inline SVG (matching `src/components/icons.tsx`), weather comes from Open-Meteo's public REST API (no key, plain `fetch`).

---

## Before you start

Read these existing files first — every task below assumes you know their shape:
- `src/lib/db.ts` — `query()` and `withTransaction()` helpers.
- `src/lib/ordenes/queries.ts` — `createOrdenProduccion`, `EstadoOrden`. You will call `createOrdenProduccion` directly; do not reimplement it.
- `src/lib/productos/queries.ts` — `Producto`, `mapRow`, `SELECT_COLUMNS`, `updateProducto`. You will extend all of these.
- `src/lib/exhibidora/queries.ts` — contains `listPlanificacion`/`actualizarMinimo`/`SlotPlanificacion`, which Task 5 deletes.
- `src/app/(app)/auditoria/page.tsx` + `actions.ts` — the closest existing example of "list of rows, one form-per-row, server actions doing writes."
- `src/app/(app)/productos/[id]/ProductoInfoForm.tsx` + `actions.ts` — the pattern for a single editable-fields form with `useActionState`.
- `vitest.setup.ts` — the `RUN_DESTRUCTIVE_DB_TESTS` gate. **Never run `npm test` or `npm run test:db` without first confirming with the user in this session that it's safe** — these tests `TRUNCATE` real tables shared with production data.

Run `npx tsc --noEmit` and `npx eslint .` after every task — both must be clean before moving on.

---

## Fase 1 — Motor de cálculo

### Task 1: Migration — nuevos campos en `d_productos`, retiro de `cantidad_minima` y `v_planificacion_diaria`

**Files:**
- Create: a new migration via `npm run migrate:create -- add-pcp-fields-to-productos` (run from `malaga-soft/`), then edit the generated file.

- [ ] **Step 1: Generate the migration file**

Run: `cd malaga-soft && npm run migrate:create -- add-pcp-fields-to-productos`

This creates `migrations/<timestamp>_add-pcp-fields-to-productos.js` with ESM scaffolding. Replace its contents entirely (the project's convention is CommonJS `exports.up`/`exports.down`, not the ESM scaffold node-pg-migrate generates by default).

- [ ] **Step 2: Write the migration**

```js
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.d_productos
      ADD COLUMN stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
      ADD COLUMN lote_optimo NUMERIC(12,3),
      ADD COLUMN lote_minimo NUMERIC(12,3);

    UPDATE malaga.d_productos p
    SET stock_minimo = e.cantidad_minima
    FROM malaga.d_exhibidora e
    WHERE e.id_prod = p.id_prod;

    DROP VIEW malaga.v_planificacion_diaria;

    ALTER TABLE malaga.d_exhibidora DROP COLUMN cantidad_minima;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.d_exhibidora ADD COLUMN cantidad_minima NUMERIC(12,3) NOT NULL DEFAULT 0;

    UPDATE malaga.d_exhibidora e
    SET cantidad_minima = p.stock_minimo
    FROM malaga.d_productos p
    WHERE p.id_prod = e.id_prod;

    CREATE VIEW malaga.v_planificacion_diaria AS
    SELECT
      base.id_exhibidora, base.nro, base.sucursal, base.id_prod, base.producto_detalle,
      base.peso_estandar, base.cantidad_minima, base.stock_actual, base.faltante,
      CASE WHEN base.faltante > 0 THEN CEIL(base.faltante / base.peso_estandar) ELSE 0 END AS bachas_sugeridas,
      CASE WHEN base.faltante > 0 THEN CEIL(base.faltante / base.peso_estandar) * base.peso_estandar ELSE 0 END AS cantidad_sugerida
    FROM (
      SELECT
        e.id_exhibidora, e.nro, e.sucursal, e.id_prod, p.detalle AS producto_detalle, p.peso_estandar,
        e.cantidad_minima, COALESCE(SUM(v.cantidad), 0) AS stock_actual,
        e.cantidad_minima - COALESCE(SUM(v.cantidad), 0) AS faltante
      FROM malaga.d_exhibidora e
      JOIN malaga.d_productos p ON p.id_prod = e.id_prod
      LEFT JOIN malaga.v_stock_pt_vivo v ON v.id_prod = e.id_prod AND v.id_exhibidora = e.id_exhibidora
      GROUP BY e.id_exhibidora, e.nro, e.sucursal, e.id_prod, p.detalle, p.peso_estandar, e.cantidad_minima
    ) base;

    ALTER TABLE malaga.d_productos
      DROP COLUMN lote_minimo,
      DROP COLUMN lote_optimo,
      DROP COLUMN stock_minimo;
  `);
};
```

The view must be dropped before the column it depends on (`e.cantidad_minima`) — Postgres refuses to drop a column a view reads from.

- [ ] **Step 3: Run the migration against the real database**

Run: `npm run migrate:up`
Expected: output ends with `Migrations complete!` and no error about the view/column dependency.

- [ ] **Step 4: Commit**

```bash
git add migrations/
git commit -m "Add stock_minimo/lote_optimo/lote_minimo to productos, retire cantidad_minima and v_planificacion_diaria"
```

---

### Task 2: Migration — tablas de factores de ajuste

**Files:**
- Create: via `npm run migrate:create -- create-pcp-factor-tables`, then edit.

- [ ] **Step 1: Generate and write the migration**

```js
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.pcp_factor_dia_semana (
      dia_semana SMALLINT PRIMARY KEY CHECK (dia_semana BETWEEN 1 AND 7),
      factor NUMERIC(6,3) NOT NULL DEFAULT 1.0
    );
    INSERT INTO malaga.pcp_factor_dia_semana (dia_semana, factor)
      SELECT d, 1.0 FROM generate_series(1, 7) AS d;

    CREATE TABLE malaga.pcp_factor_producto (
      id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
      factor NUMERIC(6,3) NOT NULL DEFAULT 1.0
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.pcp_factor_producto;
    DROP TABLE malaga.pcp_factor_dia_semana;
  `);
};
```

`pcp_factor_producto` starts empty on purpose — a product with no row is treated as factor 1.0 (see Task 8's query), and a row only gets created the first time someone edits that product's factor away from 1.0.

- [ ] **Step 2: Run the migration**

Run: `npm run migrate:up`
Expected: `Migrations complete!`

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "Add pcp_factor_dia_semana and pcp_factor_producto tables"
```

---

### Task 3: Migration — snapshot histórico de pronóstico

**Files:**
- Create: via `npm run migrate:create -- create-f-pcp-pronostico`, then edit.

- [ ] **Step 1: Generate and write the migration**

```js
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_pcp_pronostico (
      id_pronostico SERIAL PRIMARY KEY,
      fecha_plan DATE NOT NULL,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      demanda_pronosticada NUMERIC(12,3) NOT NULL,
      stock_actual_momento NUMERIC(12,3) NOT NULL,
      stock_minimo_momento NUMERIC(12,3) NOT NULL,
      cocciones_pendientes_momento NUMERIC(12,3) NOT NULL,
      necesario NUMERIC(12,3) NOT NULL,
      cantidad_planificada NUMERIC(12,3) NOT NULL,
      factor_puntual_semana NUMERIC(6,3),
      id_op_generada INTEGER REFERENCES malaga.f_ordenes_produccion(id_op),
      ts_generado TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_generado INTEGER REFERENCES malaga.usuarios(id_user)
    );

    CREATE INDEX idx_pcp_pronostico_fecha_plan ON malaga.f_pcp_pronostico(fecha_plan);
    CREATE INDEX idx_pcp_pronostico_id_prod ON malaga.f_pcp_pronostico(id_prod);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_pcp_pronostico;`);
};
```

- [ ] **Step 2: Run the migration**

Run: `npm run migrate:up`
Expected: `Migrations complete!`

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "Add f_pcp_pronostico snapshot table"
```

---

### Task 4: Extender `d_productos` en la capa de queries y el formulario de producto

**Files:**
- Modify: `src/lib/productos/queries.ts`
- Modify: `src/app/(app)/productos/[id]/ProductoInfoForm.tsx`
- Modify: `src/app/(app)/productos/[id]/actions.ts`
- Test: `src/lib/productos/queries.test.ts` (create if it doesn't exist yet — check first with `ls src/lib/productos/*.test.ts`)

- [ ] **Step 1: Write the failing test**

If `src/lib/productos/queries.test.ts` doesn't exist, create it with this content. If it exists, add this `it` block inside the existing `describe`.

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto, updateProducto, getProducto } from "./queries";

describe("productos queries — campos de PCP", () => {
  beforeEach(async () => {
    await query("TRUNCATE malaga.d_productos RESTART IDENTITY CASCADE");
  });

  it("crea un producto con stock_minimo en 0 y lotes nulos por defecto", async () => {
    const p = await createProducto({ detalle: "Base Test", unidMed: "kg", tipoProducto: "SEMI" });
    expect(p.stockMinimo).toBe("0.000");
    expect(p.loteOptimo).toBeNull();
    expect(p.loteMinimo).toBeNull();
  });

  it("actualizarProducto guarda stock_minimo, lote_optimo y lote_minimo", async () => {
    const p = await createProducto({ detalle: "Base Test", unidMed: "kg", tipoProducto: "SEMI" });
    await updateProducto(p.idProd, {
      detalle: "Base Test",
      unidMed: "kg",
      activo: true,
      stockMinimo: 5,
      loteOptimo: 10,
      loteMinimo: 60,
    });
    const updated = await getProducto(p.idProd);
    expect(Number(updated!.stockMinimo)).toBe(5);
    expect(Number(updated!.loteOptimo)).toBe(10);
    expect(Number(updated!.loteMinimo)).toBe(60);
  });

  it("lote_optimo y lote_minimo se pueden dejar en null (libre)", async () => {
    const p = await createProducto({ detalle: "Base Libre", unidMed: "kg", tipoProducto: "SEMI" });
    await updateProducto(p.idProd, { detalle: "Base Libre", unidMed: "kg", activo: true, stockMinimo: 0 });
    const updated = await getProducto(p.idProd);
    expect(updated!.loteOptimo).toBeNull();
    expect(updated!.loteMinimo).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db -- productos/queries.test.ts`
Expected: FAIL — `stockMinimo`/`loteOptimo`/`loteMinimo` don't exist on `Producto` yet, or `updateProducto` doesn't accept them (TypeScript error or `undefined` values in the assertions).

- [ ] **Step 3: Extend `src/lib/productos/queries.ts`**

Replace the whole file with:

```typescript
import { query } from "../db";

export type TipoProducto = "PT" | "SEMI";

export interface Producto {
  idProd: number;
  codigo: string | null;
  detalle: string;
  sector: string | null;
  familia: string | null;
  unidMed: string;
  tipoProducto: TipoProducto;
  pesoEstandar: string | null;
  activo: boolean;
  posicionExhibidora: number | null;
  stockMinimo: string;
  loteOptimo: string | null;
  loteMinimo: string | null;
}

interface ProductoRow {
  id_prod: number;
  codigo: string | null;
  detalle: string;
  sector: string | null;
  familia: string | null;
  unid_med: string;
  tipo_producto: TipoProducto;
  peso_estandar: string | null;
  activo: boolean;
  posicion_exhibidora: number | null;
  stock_minimo: string;
  lote_optimo: string | null;
  lote_minimo: string | null;
}

function mapRow(row: ProductoRow): Producto {
  return {
    idProd: row.id_prod,
    codigo: row.codigo,
    detalle: row.detalle,
    sector: row.sector,
    familia: row.familia,
    unidMed: row.unid_med,
    tipoProducto: row.tipo_producto,
    pesoEstandar: row.peso_estandar,
    activo: row.activo,
    posicionExhibidora: row.posicion_exhibidora,
    stockMinimo: row.stock_minimo,
    loteOptimo: row.lote_optimo,
    loteMinimo: row.lote_minimo,
  };
}

const SELECT_COLUMNS = `p.id_prod, p.codigo, p.detalle, p.sector, p.familia, p.unid_med, p.tipo_producto,
       p.peso_estandar, p.activo, e.nro AS posicion_exhibidora, p.stock_minimo, p.lote_optimo, p.lote_minimo`;
const FROM_CLAUSE = `FROM malaga.d_productos p
     LEFT JOIN malaga.d_exhibidora e ON e.id_prod = p.id_prod`;

export async function listProductos(): Promise<Producto[]> {
  const result = await query<ProductoRow>(
    `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ORDER BY p.tipo_producto, p.detalle`
  );
  return result.rows.map(mapRow);
}

export async function getProducto(idProd: number): Promise<Producto | null> {
  const result = await query<ProductoRow>(
    `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE p.id_prod = $1`,
    [idProd]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export interface UpdateProductoInput {
  codigo?: string;
  detalle: string;
  sector?: string;
  familia?: string;
  unidMed: string;
  pesoEstandar?: number;
  activo: boolean;
  stockMinimo: number;
  loteOptimo?: number;
  loteMinimo?: number;
}

export async function updateProducto(idProd: number, input: UpdateProductoInput): Promise<Producto> {
  const existing = await getProducto(idProd);
  if (!existing) throw new Error("Producto no encontrado");
  if (existing.tipoProducto === "PT" && !input.pesoEstandar) {
    throw new Error("peso_estandar es obligatorio para productos PT");
  }

  await query(
    `UPDATE malaga.d_productos
     SET codigo = $2, detalle = $3, sector = $4, familia = $5, unid_med = $6, peso_estandar = $7, activo = $8,
         stock_minimo = $9, lote_optimo = $10, lote_minimo = $11
     WHERE id_prod = $1`,
    [
      idProd,
      input.codigo ?? null,
      input.detalle,
      input.sector ?? null,
      input.familia ?? null,
      input.unidMed,
      input.pesoEstandar ?? null,
      input.activo,
      input.stockMinimo,
      input.loteOptimo ?? null,
      input.loteMinimo ?? null,
    ]
  );
  const updated = await getProducto(idProd);
  return updated!;
}

export interface CreateProductoInput {
  codigo?: string;
  detalle: string;
  sector?: string;
  familia?: string;
  unidMed: string;
  tipoProducto: TipoProducto;
  pesoEstandar?: number;
}

export async function createProducto(input: CreateProductoInput): Promise<Producto> {
  if (input.tipoProducto === "PT" && !input.pesoEstandar) {
    throw new Error("peso_estandar es obligatorio para productos PT");
  }

  const result = await query<{ id_prod: number }>(
    `INSERT INTO malaga.d_productos (codigo, detalle, sector, familia, unid_med, tipo_producto, peso_estandar)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id_prod`,
    [
      input.codigo ?? null,
      input.detalle,
      input.sector ?? null,
      input.familia ?? null,
      input.unidMed,
      input.tipoProducto,
      input.pesoEstandar ?? null,
    ]
  );
  const created = await getProducto(result.rows[0].id_prod);
  return created!;
}
```

`CreateProductoInput` deliberately does not take `stockMinimo`/`loteOptimo`/`loteMinimo` — new products get the column defaults (0 / null / null) and are configured afterward from the product page, same as today's flow for `pesoEstandar` on SEMI products.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:db -- productos/queries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update `ProductoInfoForm.tsx`**

In `src/app/(app)/productos/[id]/ProductoInfoForm.tsx`, add three fields after the `pesoEstandar` block (before the `activo` checkbox):

```tsx
      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Stock mínimo de seguridad
          <input
            name="stockMinimo"
            type="number"
            step="0.001"
            required
            defaultValue={producto.stockMinimo}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Lote óptimo (vacío = libre)
          <input
            name="loteOptimo"
            type="number"
            step="0.001"
            defaultValue={producto.loteOptimo ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Lote mínimo (vacío = libre)
          <input
            name="loteMinimo"
            type="number"
            step="0.001"
            defaultValue={producto.loteMinimo ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
      </div>
```

- [ ] **Step 6: Update `actions.ts`**

In `src/app/(app)/productos/[id]/actions.ts`, add parsing and pass-through for the three new fields:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { updateProducto } from "@/lib/productos/queries";

export async function actualizarProductoAction(
  _prevState: { error?: string; ok?: boolean } | undefined,
  formData: FormData
) {
  await requireRole(["gestion", "admin"]);

  const idProd = Number(formData.get("idProd"));
  const codigo = String(formData.get("codigo") ?? "").trim() || undefined;
  const detalle = String(formData.get("detalle") ?? "").trim();
  const unidMed = String(formData.get("unidMed") ?? "").trim();
  const sector = String(formData.get("sector") ?? "").trim() || undefined;
  const familia = String(formData.get("familia") ?? "").trim() || undefined;
  const pesoEstandarRaw = String(formData.get("pesoEstandar") ?? "").trim();
  const stockMinimoRaw = String(formData.get("stockMinimo") ?? "").trim();
  const loteOptimoRaw = String(formData.get("loteOptimo") ?? "").trim();
  const loteMinimoRaw = String(formData.get("loteMinimo") ?? "").trim();
  const activo = formData.get("activo") === "on";

  if (!idProd || !detalle || !unidMed || !stockMinimoRaw) {
    return { error: "Completá detalle, unidad de medida y stock mínimo." };
  }

  const pesoEstandar = pesoEstandarRaw ? Number(pesoEstandarRaw) : undefined;
  const stockMinimo = Number(stockMinimoRaw);
  const loteOptimo = loteOptimoRaw ? Number(loteOptimoRaw) : undefined;
  const loteMinimo = loteMinimoRaw ? Number(loteMinimoRaw) : undefined;

  try {
    await updateProducto(idProd, {
      codigo,
      detalle,
      unidMed,
      sector,
      familia,
      pesoEstandar,
      activo,
      stockMinimo,
      loteOptimo,
      loteMinimo,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar el producto." };
  }

  revalidatePath(`/productos/${idProd}`);
  revalidatePath("/productos");
  return { ok: true };
}
```

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/productos/queries.ts src/lib/productos/queries.test.ts src/app/\(app\)/productos/\[id\]/ProductoInfoForm.tsx src/app/\(app\)/productos/\[id\]/actions.ts
git commit -m "Add stock_minimo/lote_optimo/lote_minimo to product edit form"
```

---

### Task 5: Retirar `listPlanificacion`/`actualizarMinimo`

**Files:**
- Modify: `src/lib/exhibidora/queries.ts`
- Modify: `src/lib/exhibidora/queries.test.ts`

- [ ] **Step 1: Remove the dead code from `queries.ts`**

In `src/lib/exhibidora/queries.ts`, delete the `SlotPlanificacion` interface, the `listPlanificacion` function (lines 3–49 in the current file), and the `actualizarMinimo` function. The file should now start directly with the `CartillaSlot` interface and `aplicarCambiosVencidos`.

- [ ] **Step 2: Remove the corresponding test**

In `src/lib/exhibidora/queries.test.ts`, remove `actualizarMinimo` from the import list, and delete the `it("actualizarMinimo cambia la cantidad_minima del slot", ...)` test block entirely (it references the now-dropped `cantidad_minima` column and the removed function).

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors. If any other file still imports `listPlanificacion`/`actualizarMinimo`/`SlotPlanificacion`, tsc will point at it — grep first to be sure: `grep -rn "listPlanificacion\|actualizarMinimo\|SlotPlanificacion" src/` should return nothing after this task (Task 4 already removed `actualizarMinimo` usage inside `productos` — this is a different `actualizarMinimo`, the one in `exhibidora/queries.ts`; they are unrelated functions that happen to share a name from the old design. Rename risk: none, since Task 4's version lives in `productos/queries.ts` and is untouched here).

- [ ] **Step 4: Run remaining exhibidora tests to confirm nothing else broke**

Run: `npm run test:db -- exhibidora/queries.test.ts`
Expected: PASS (the cartilla/exhibir tests, minus the removed one)

- [ ] **Step 5: Commit**

```bash
git add src/lib/exhibidora/queries.ts src/lib/exhibidora/queries.test.ts
git commit -m "Remove listPlanificacion/actualizarMinimo, superseded by PCP"
```

---

### Task 6: Motor de cálculo puro (sin base de datos)

**Files:**
- Create: `src/lib/pcp/forecast.ts`
- Test: `src/lib/pcp/forecast.test.ts`

This is the only test file in this plan that does **not** need `RUN_DESTRUCTIVE_DB_TESTS` — it's pure math, no `query()` calls. Runs with plain `npm test`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  regresionLineal,
  proyectarSiguiente,
  diaSemanaIso,
  redondearArriba,
  calcularNecesario,
  calcularCantidadAPlanificar,
} from "./forecast";

describe("regresionLineal", () => {
  it("una recta perfecta (y = 2x + 1) da pendiente 2 y ordenada 1", () => {
    const r = regresionLineal([1, 3, 5, 7, 9]);
    expect(r.pendiente).toBeCloseTo(2, 5);
    expect(r.ordenada).toBeCloseTo(1, 5);
  });

  it("valores constantes dan pendiente 0", () => {
    const r = regresionLineal([10, 10, 10, 10]);
    expect(r.pendiente).toBeCloseTo(0, 5);
    expect(r.ordenada).toBeCloseTo(10, 5);
  });
});

describe("proyectarSiguiente", () => {
  it("proyecta el siguiente punto de una tendencia lineal", () => {
    // y = 2x + 1 para x=0..4 -> [1,3,5,7,9]; el siguiente (x=5) es 11.
    expect(proyectarSiguiente([1, 3, 5, 7, 9])).toBeCloseTo(11, 5);
  });

  it("con un solo punto, proyecta ese mismo valor", () => {
    expect(proyectarSiguiente([42])).toBe(42);
  });

  it("con cero puntos, proyecta 0", () => {
    expect(proyectarSiguiente([])).toBe(0);
  });
});

describe("diaSemanaIso", () => {
  it("2026-08-05 es miércoles (ISO 3)", () => {
    expect(diaSemanaIso(new Date("2026-08-05T12:00:00Z"))).toBe(3);
  });

  it("2026-08-09 es domingo (ISO 7)", () => {
    expect(diaSemanaIso(new Date("2026-08-09T12:00:00Z"))).toBe(7);
  });

  it("2026-08-10 es lunes (ISO 1)", () => {
    expect(diaSemanaIso(new Date("2026-08-10T12:00:00Z"))).toBe(1);
  });
});

describe("redondearArriba", () => {
  it("redondea hacia arriba al múltiplo del lote óptimo", () => {
    expect(redondearArriba(10.099, 10)).toBe(20);
  });

  it("un valor exacto no cambia", () => {
    expect(redondearArriba(20, 10)).toBe(20);
  });

  it("sin lote óptimo (null), no redondea", () => {
    expect(redondearArriba(10.099, null)).toBe(10.099);
  });

  it("lote óptimo 0 se trata como libre", () => {
    expect(redondearArriba(10.099, 0)).toBe(10.099);
  });
});

describe("calcularNecesario", () => {
  it("caso del spec: demanda 8.89, stock 3.8, mínimo 5, pendientes 0 -> 10.09", () => {
    const necesario = calcularNecesario({
      demanda: 8.89,
      stockActual: 3.8,
      stockMinimo: 5,
      coccionesPendientes: 0,
    });
    expect(necesario).toBeCloseTo(10.09, 5);
  });

  it("descuenta cocciones/OPs pendientes", () => {
    const necesario = calcularNecesario({
      demanda: 20,
      stockActual: 5,
      stockMinimo: 5,
      coccionesPendientes: 15,
    });
    expect(necesario).toBeCloseTo(5, 5);
  });
});

describe("calcularCantidadAPlanificar", () => {
  it("caso del spec: necesario 10.099, lote óptimo 10, lote mínimo 60 -> 60", () => {
    const cantidad = calcularCantidadAPlanificar({ necesario: 10.099, loteOptimo: 10, loteMinimo: 60 });
    expect(cantidad).toBe(60);
  });

  it("necesario negativo o cero no planifica nada", () => {
    expect(calcularCantidadAPlanificar({ necesario: 0, loteOptimo: 10, loteMinimo: 60 })).toBe(0);
    expect(calcularCantidadAPlanificar({ necesario: -5, loteOptimo: 10, loteMinimo: 60 })).toBe(0);
  });

  it("sin lote mínimo, el redondeo al lote óptimo alcanza", () => {
    expect(calcularCantidadAPlanificar({ necesario: 21, loteOptimo: 10, loteMinimo: null })).toBe(30);
  });

  it("todo libre (ambos null) devuelve el necesario tal cual", () => {
    expect(calcularCantidadAPlanificar({ necesario: 12.5, loteOptimo: null, loteMinimo: null })).toBe(12.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/pcp/forecast.test.ts`
Expected: FAIL — `src/lib/pcp/forecast.ts` doesn't exist yet.

- [ ] **Step 3: Implement `src/lib/pcp/forecast.ts`**

```typescript
export interface RegresionLineal {
  pendiente: number;
  ordenada: number;
}

// Regresión lineal simple por mínimos cuadrados, con x = 0, 1, 2, ... (una semana por punto).
export function regresionLineal(valores: number[]): RegresionLineal {
  const n = valores.length;
  if (n === 0) return { pendiente: 0, ordenada: 0 };
  if (n === 1) return { pendiente: 0, ordenada: valores[0] };

  const xs = valores.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = valores.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * valores[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);

  const denominador = n * sumXX - sumX * sumX;
  if (denominador === 0) return { pendiente: 0, ordenada: sumY / n };

  const pendiente = (n * sumXY - sumX * sumY) / denominador;
  const ordenada = (sumY - pendiente * sumX) / n;
  return { pendiente, ordenada };
}

// Proyecta el valor del siguiente punto (x = n) sobre la recta ajustada a `valores`.
export function proyectarSiguiente(valores: number[]): number {
  if (valores.length === 0) return 0;
  const { pendiente, ordenada } = regresionLineal(valores);
  return pendiente * valores.length + ordenada;
}

// Día ISO de la semana (1 = lunes ... 7 = domingo) para una fecha dada.
export function diaSemanaIso(fecha: Date): number {
  const diaJs = fecha.getUTCDay(); // 0 = domingo ... 6 = sábado
  return diaJs === 0 ? 7 : diaJs;
}

// Redondea `valor` hacia arriba al múltiplo de `loteOptimo` más cercano.
// loteOptimo nulo o 0 significa "libre": no hay restricción de redondeo.
export function redondearArriba(valor: number, loteOptimo: number | null): number {
  if (!loteOptimo) return valor;
  return Math.ceil(valor / loteOptimo) * loteOptimo;
}

export interface NecesarioInput {
  demanda: number;
  stockActual: number;
  stockMinimo: number;
  coccionesPendientes: number;
}

export function calcularNecesario(input: NecesarioInput): number {
  return input.demanda - input.stockActual + input.stockMinimo - input.coccionesPendientes;
}

export interface CantidadAPlanificarInput {
  necesario: number;
  loteOptimo: number | null;
  loteMinimo: number | null;
}

export function calcularCantidadAPlanificar(input: CantidadAPlanificarInput): number {
  if (input.necesario <= 0) return 0;
  const redondeado = redondearArriba(input.necesario, input.loteOptimo);
  return input.loteMinimo ? Math.max(redondeado, input.loteMinimo) : redondeado;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pcp/forecast.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/forecast.ts src/lib/pcp/forecast.test.ts
git commit -m "Add pure PCP forecast math: linear regression, rounding, necesario formula"
```

---

### Task 7: Agregados históricos de exhibición

**Files:**
- Create: `src/lib/pcp/queries.ts`
- Test: `src/lib/pcp/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { getExhibicionesPorSemana, getDistribucionPorDia, getDistribucionPorProducto } from "./queries";

describe("pcp queries — históricos", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE"
    );
  });

  async function exhibir(idProd: number, ts: string, cantidad: number) {
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion)
       VALUES ($1, $2, $3::date, 'L', $3::timestamptz)`,
      [idProd, cantidad, ts]
    );
  }

  it("getExhibicionesPorSemana suma cantidad de PT exhibida por semana, semanas completas nada más", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    // Semana pasada completa (lunes 2026-07-27).
    await exhibir(p.idProd, "2026-07-27T10:00:00Z", 10);
    await exhibir(p.idProd, "2026-07-29T10:00:00Z", 5);
    // Semana actual (no debe contarse como completa): usamos "ahora" real, así que
    // insertamos con fecha muy futura para asegurarnos de que cae en la semana en curso
    // sea cual sea la fecha real de ejecución del test.
    const hoy = new Date();
    await exhibir(p.idProd, hoy.toISOString(), 999);

    const semanas = await getExhibicionesPorSemana(8);
    const totalSemanaActual = semanas.find((s) => {
      const inicioSemana = new Date(s.semana);
      const diff = (hoy.getTime() - inicioSemana.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff < 7;
    });
    expect(totalSemanaActual).toBeUndefined();
  });

  it("getDistribucionPorDia reparte % entre los días con exhibiciones", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    // 2026-07-27 es lunes (ISO 1), 2026-07-28 es martes (ISO 2).
    await exhibir(p.idProd, "2026-07-27T10:00:00Z", 30);
    await exhibir(p.idProd, "2026-07-28T10:00:00Z", 70);

    const distribucion = await getDistribucionPorDia(8);
    expect(distribucion[1]).toBeCloseTo(0.3, 5);
    expect(distribucion[2]).toBeCloseTo(0.7, 5);
  });

  it("getDistribucionPorProducto solo considera productos actualmente en cartilla", async () => {
    const enCartilla = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const fueraDeCartilla = await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [enCartilla.idProd]);

    await exhibir(enCartilla.idProd, "2026-07-27T10:00:00Z", 40);
    await exhibir(fueraDeCartilla.idProd, "2026-07-27T10:00:00Z", 60);

    const distribucion = await getDistribucionPorProducto(8);
    expect(distribucion[enCartilla.idProd]).toBeCloseTo(1, 5);
    expect(distribucion[fueraDeCartilla.idProd]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: FAIL — `src/lib/pcp/queries.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

```typescript
import { query } from "../db";

export interface TotalSemanal {
  semana: string;
  total: number;
}

export async function getExhibicionesPorSemana(semanas = 8): Promise<TotalSemanal[]> {
  const result = await query<{ semana: string; total: string }>(
    `SELECT date_trunc('week', ps.ts_exhibicion)::date::text AS semana, SUM(ps.cantidad) AS total
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NOT NULL
       AND ps.ts_exhibicion >= date_trunc('week', CURRENT_DATE) - ($1 || ' weeks')::interval
       AND ps.ts_exhibicion < date_trunc('week', CURRENT_DATE)
     GROUP BY 1
     ORDER BY 1`,
    [semanas]
  );
  return result.rows.map((r) => ({ semana: r.semana, total: Number(r.total) }));
}

// dia_semana (1=lunes..7=domingo) -> fracción [0,1] del total exhibido en ese día,
// promediado sobre las últimas `semanas` semanas completas. Días sin historial no
// aparecen en el resultado (tratarlos como 0 queda a cargo de quien consuma esto).
export async function getDistribucionPorDia(semanas = 8): Promise<Record<number, number>> {
  const result = await query<{ dia_semana: number; total: string }>(
    `SELECT EXTRACT(ISODOW FROM ps.ts_exhibicion)::int AS dia_semana, SUM(ps.cantidad) AS total
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NOT NULL
       AND ps.ts_exhibicion >= date_trunc('week', CURRENT_DATE) - ($1 || ' weeks')::interval
       AND ps.ts_exhibicion < date_trunc('week', CURRENT_DATE)
     GROUP BY 1`,
    [semanas]
  );
  const totalGeneral = result.rows.reduce((acc, r) => acc + Number(r.total), 0);
  if (totalGeneral === 0) return {};

  const distribucion: Record<number, number> = {};
  for (const r of result.rows) {
    distribucion[r.dia_semana] = Number(r.total) / totalGeneral;
  }
  return distribucion;
}

// id_prod -> fracción [0,1] del total exhibido, solo entre productos actualmente en
// cartilla (los 24 slots de d_exhibidora).
export async function getDistribucionPorProducto(semanas = 8): Promise<Record<number, number>> {
  const result = await query<{ id_prod: number; total: string }>(
    `SELECT ps.id_prod, SUM(ps.cantidad) AS total
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NOT NULL
       AND ps.ts_exhibicion >= date_trunc('week', CURRENT_DATE) - ($1 || ' weeks')::interval
       AND ps.ts_exhibicion < date_trunc('week', CURRENT_DATE)
       AND ps.id_prod IN (SELECT id_prod FROM malaga.d_exhibidora)
     GROUP BY 1`,
    [semanas]
  );
  const totalGeneral = result.rows.reduce((acc, r) => acc + Number(r.total), 0);
  if (totalGeneral === 0) return {};

  const distribucion: Record<number, number> = {};
  for (const r of result.rows) {
    distribucion[r.id_prod] = Number(r.total) / totalGeneral;
  }
  return distribucion;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/queries.ts src/lib/pcp/queries.test.ts
git commit -m "Add PCP historical aggregation queries (weekly totals, day/product distribution)"
```

---

### Task 8: Factores de ajuste persistentes

**Files:**
- Modify: `src/lib/pcp/queries.ts`
- Modify: `src/lib/pcp/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/pcp/queries.test.ts` (new `describe` block, same file):

```typescript
import { getFactoresDia, setFactorDia, listFactoresProducto, setFactorProducto } from "./queries";

describe("pcp queries — factores", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos, malaga.pcp_factor_producto RESTART IDENTITY CASCADE"
    );
    await query("UPDATE malaga.pcp_factor_dia_semana SET factor = 1.0");
  });

  it("getFactoresDia devuelve los 7 días con factor 1.0 por defecto", async () => {
    const factores = await getFactoresDia();
    expect(factores).toHaveLength(7);
    expect(factores.every((f) => f.factor === 1)).toBe(true);
  });

  it("setFactorDia actualiza el factor de un día puntual", async () => {
    await setFactorDia(6, 1.15);
    const factores = await getFactoresDia();
    const sabado = factores.find((f) => f.diaSemana === 6)!;
    expect(sabado.factor).toBeCloseTo(1.15, 5);
  });

  it("listFactoresProducto devuelve factor 1.0 para productos sin fila propia", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const factores = await listFactoresProducto();
    const fila = factores.find((f) => f.idProd === p.idProd)!;
    expect(fila.factor).toBe(1);
  });

  it("setFactorProducto crea o actualiza la fila de ese producto", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await setFactorProducto(p.idProd, 0.85);
    let factores = await listFactoresProducto();
    expect(factores.find((f) => f.idProd === p.idProd)!.factor).toBeCloseTo(0.85, 5);

    await setFactorProducto(p.idProd, 1.2);
    factores = await listFactoresProducto();
    expect(factores.find((f) => f.idProd === p.idProd)!.factor).toBeCloseTo(1.2, 5);
  });
});
```

Add the `createProducto` import to the existing import line from `../productos/queries` at the top of the file (it's already imported for Task 7's tests — just reuse it).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: FAIL — the four functions don't exist yet.

- [ ] **Step 3: Add to `src/lib/pcp/queries.ts`**

Append:

```typescript
export interface FactorDia {
  diaSemana: number;
  factor: number;
}

export async function getFactoresDia(): Promise<FactorDia[]> {
  const result = await query<{ dia_semana: number; factor: string }>(
    `SELECT dia_semana, factor FROM malaga.pcp_factor_dia_semana ORDER BY dia_semana`
  );
  return result.rows.map((r) => ({ diaSemana: r.dia_semana, factor: Number(r.factor) }));
}

export async function setFactorDia(diaSemana: number, factor: number): Promise<void> {
  await query(`UPDATE malaga.pcp_factor_dia_semana SET factor = $2 WHERE dia_semana = $1`, [diaSemana, factor]);
}

export interface FactorProducto {
  idProd: number;
  productoDetalle: string;
  factor: number;
}

export async function listFactoresProducto(): Promise<FactorProducto[]> {
  const result = await query<{ id_prod: number; detalle: string; factor: string }>(
    `SELECT p.id_prod, p.detalle, COALESCE(f.factor, 1.0) AS factor
     FROM malaga.d_productos p
     LEFT JOIN malaga.pcp_factor_producto f ON f.id_prod = p.id_prod
     WHERE p.activo = true
     ORDER BY p.tipo_producto, p.detalle`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, productoDetalle: r.detalle, factor: Number(r.factor) }));
}

export async function setFactorProducto(idProd: number, factor: number): Promise<void> {
  await query(
    `INSERT INTO malaga.pcp_factor_producto (id_prod, factor) VALUES ($1, $2)
     ON CONFLICT (id_prod) DO UPDATE SET factor = EXCLUDED.factor`,
    [idProd, factor]
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: PASS (7 tests total: 3 from Task 7 + 4 new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/queries.ts src/lib/pcp/queries.test.ts
git commit -m "Add PCP adjustment factor queries (persistent, per day-of-week and per product)"
```

---

### Task 9: Config de producto, stock actual y cocciones pendientes (por lotes, no fila a fila)

**Files:**
- Modify: `src/lib/pcp/queries.ts`
- Modify: `src/lib/pcp/queries.test.ts`

Everything here returns a `Map` keyed by `id_prod`, fetched with one query for **all** products at once — `calcularPlanManana` (Task 10) needs config/stock/pendientes for ~40 products, and doing that as 40 separate round-trips would repeat the N+1 mistake this project already fixed once (`listRecetasActivas`, see `src/lib/recetas/queries.ts`).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/pcp/queries.test.ts`:

```typescript
import {
  getConfigTodosLosProductos,
  getStockActualPorProducto,
  getCoccionesPendientesPorProducto,
  getProductosEnCartilla,
  getItemsRecetaSemiPorProducto,
} from "./queries";
import { createReceta } from "../recetas/queries";

describe("pcp queries — config, stock y pendientes por lote", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_exhibidora, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("getConfigTodosLosProductos trae stock_minimo/lote_optimo/lote_minimo de cada producto", async () => {
    const p = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(
      `UPDATE malaga.d_productos SET stock_minimo = 5, lote_optimo = 10, lote_minimo = 60 WHERE id_prod = $1`,
      [p.idProd]
    );

    const config = await getConfigTodosLosProductos();
    const c = config.get(p.idProd)!;
    expect(c.stockMinimo).toBe(5);
    expect(c.loteOptimo).toBe(10);
    expect(c.loteMinimo).toBe(60);
  });

  it("getStockActualPorProducto suma vivo de PT y de SEMI (restante)", async () => {
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [pt.idProd]
    );
    const userExhibicion = await seedUser();
    const partidaPt = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [pt.idProd]
    );
    await query(
      `UPDATE malaga.f_partidas_stock SET ts_exhibicion = now(), id_exhibidora = $2, user_exhibicion = $3 WHERE id_partistock = $1`,
      [partidaPt.rows[0].id_partistock, exhib.rows[0].id_exhibidora, userExhibicion]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 7, '2026-08-01', 'L2')`,
      [semi.idProd]
    );

    const stock = await getStockActualPorProducto();
    expect(stock.get(pt.idProd)).toBe(4);
    expect(stock.get(semi.idProd)).toBe(7);
  });

  it("getCoccionesPendientesPorProducto suma cant_plan de OPs planificada/en_proceso, no de las finalizadas", async () => {
    const p = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado) VALUES ($1, 20, '2026-08-06', 'planificada')`,
      [p.idProd]
    );
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado, ts_ini) VALUES ($1, 15, '2026-08-06', 'en_proceso', now())`,
      [p.idProd]
    );
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado) VALUES ($1, 999, '2026-08-01', 'finalizada')`,
      [p.idProd]
    );

    const pendientes = await getCoccionesPendientesPorProducto();
    expect(pendientes.get(p.idProd)).toBe(35);
  });

  it("getProductosEnCartilla devuelve solo los PT actualmente en un slot", async () => {
    const enCartilla = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [enCartilla.idProd]);

    const productos = await getProductosEnCartilla();
    expect(productos.map((p) => p.idProd)).toEqual([enCartilla.idProd]);
  });

  it("getItemsRecetaSemiPorProducto trae solo ingredientes SEMI de la receta activa", async () => {
    const userAlta = await seedUser();
    const pt = await createProducto({ detalle: "Gianduia", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const otroPt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }, { idSubprod: otroPt.idProd, cantSubprod: 0.1 }], userAlta });

    const items = await getItemsRecetaSemiPorProducto([pt.idProd]);
    const itemsDePt = items.get(pt.idProd) ?? [];
    expect(itemsDePt).toHaveLength(1);
    expect(itemsDePt[0].idSubprod).toBe(semi.idProd);
    expect(Number(itemsDePt[0].cantSubprod)).toBeCloseTo(0.5, 5);
  });

  it("getItemsRecetaSemiPorProducto con lista vacía no falla", async () => {
    const items = await getItemsRecetaSemiPorProducto([]);
    expect(items.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: FAIL — the five functions don't exist yet.

- [ ] **Step 3: Add to `src/lib/pcp/queries.ts`**

Append:

```typescript
export interface ConfigProducto {
  idProd: number;
  detalle: string;
  tipoProducto: "PT" | "SEMI";
  stockMinimo: number;
  loteOptimo: number | null;
  loteMinimo: number | null;
}

export async function getConfigTodosLosProductos(): Promise<Map<number, ConfigProducto>> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    tipo_producto: "PT" | "SEMI";
    stock_minimo: string;
    lote_optimo: string | null;
    lote_minimo: string | null;
  }>(`SELECT id_prod, detalle, tipo_producto, stock_minimo, lote_optimo, lote_minimo FROM malaga.d_productos`);

  const config = new Map<number, ConfigProducto>();
  for (const r of result.rows) {
    config.set(r.id_prod, {
      idProd: r.id_prod,
      detalle: r.detalle,
      tipoProducto: r.tipo_producto,
      stockMinimo: Number(r.stock_minimo),
      loteOptimo: r.lote_optimo === null ? null : Number(r.lote_optimo),
      loteMinimo: r.lote_minimo === null ? null : Number(r.lote_minimo),
    });
  }
  return config;
}

export async function getStockActualPorProducto(): Promise<Map<number, number>> {
  const result = await query<{ id_prod: number; total: string }>(
    `SELECT id_prod, SUM(cantidad) AS total FROM malaga.v_stock_pt_vivo GROUP BY id_prod
     UNION ALL
     SELECT id_prod, SUM(restante) AS total FROM malaga.v_stock_semi_vivo GROUP BY id_prod`
  );
  const stock = new Map<number, number>();
  for (const r of result.rows) {
    stock.set(r.id_prod, Number(r.total));
  }
  return stock;
}

export async function getCoccionesPendientesPorProducto(): Promise<Map<number, number>> {
  const result = await query<{ id_prod: number; total: string }>(
    `SELECT id_prod, SUM(cant_plan) AS total
     FROM malaga.f_ordenes_produccion
     WHERE estado IN ('planificada', 'en_proceso')
     GROUP BY id_prod`
  );
  const pendientes = new Map<number, number>();
  for (const r of result.rows) {
    pendientes.set(r.id_prod, Number(r.total));
  }
  return pendientes;
}

export interface ProductoEnCartilla {
  idProd: number;
  detalle: string;
}

export async function getProductosEnCartilla(): Promise<ProductoEnCartilla[]> {
  const result = await query<{ id_prod: number; detalle: string }>(
    `SELECT DISTINCT p.id_prod, p.detalle
     FROM malaga.d_exhibidora e
     JOIN malaga.d_productos p ON p.id_prod = e.id_prod
     ORDER BY p.detalle`
  );
  return result.rows;
}

export interface ItemRecetaSemi {
  idSubprod: number;
  cantSubprod: string;
}

export async function getItemsRecetaSemiPorProducto(
  idsProdPt: number[]
): Promise<Map<number, ItemRecetaSemi[]>> {
  const items = new Map<number, ItemRecetaSemi[]>();
  if (idsProdPt.length === 0) return items;

  const result = await query<{ id_prod_padre: number; id_subprod: number; cant_subprod: string }>(
    `SELECT r.id_prod AS id_prod_padre, rd.id_subprod, rd.cant_subprod
     FROM malaga.recetas r
     JOIN malaga.recetas_detalles rd ON rd.id_receta = r.id_receta
     JOIN malaga.d_productos sp ON sp.id_prod = rd.id_subprod
     WHERE r.activa = true AND sp.tipo_producto = 'SEMI' AND r.id_prod = ANY($1::int[])`,
    [idsProdPt]
  );
  for (const r of result.rows) {
    const lista = items.get(r.id_prod_padre) ?? [];
    lista.push({ idSubprod: r.id_subprod, cantSubprod: r.cant_subprod });
    items.set(r.id_prod_padre, lista);
  }
  return items;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: PASS (13 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/queries.ts src/lib/pcp/queries.test.ts
git commit -m "Add batched PCP lookups: product config, live stock, pending OPs, recipe explosion"
```

---

### Task 10: `calcularPlanManana` — orquestación completa (PT y SEMI)

**Files:**
- Modify: `src/lib/pcp/queries.ts`
- Modify: `src/lib/pcp/queries.test.ts`

This is the function everything else in this task list builds toward: it ties Tasks 6–9 together into the actual "qué producir mañana" list.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/pcp/queries.test.ts`:

```typescript
import { calcularPlanManana } from "./queries";

describe("calcularPlanManana", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_exhibidora, malaga.d_productos, malaga.pcp_factor_producto RESTART IDENTITY CASCADE"
    );
    await query("UPDATE malaga.pcp_factor_dia_semana SET factor = 1.0");
  });

  it("sin historial de exhibiciones ni stock mínimo, no sugiere nada", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [p.idProd]);

    const filas = await calcularPlanManana();
    const fila = filas.find((f) => f.idProd === p.idProd)!;
    expect(fila.demandaPronosticada).toBe(0);
    expect(fila.cantidadAPlanificar).toBe(0);
  });

  it("con stock mínimo pero sin stock actual, sugiere producir aunque no haya pronóstico", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [p.idProd]);
    await query(`UPDATE malaga.d_productos SET stock_minimo = 4, lote_optimo = 4 WHERE id_prod = $1`, [p.idProd]);

    const filas = await calcularPlanManana();
    const fila = filas.find((f) => f.idProd === p.idProd)!;
    expect(fila.necesario).toBeCloseTo(4, 5);
    expect(fila.cantidadAPlanificar).toBe(4);
  });

  it("explota la receta activa y suma la demanda de la base entre todos los sabores que la usan", async () => {
    const userAlta = (
      await query<{ id_user: number }>(
        `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com','x','admin') RETURNING id_user`
      )
    ).rows[0].id_user;

    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const pt1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const pt2 = await createProducto({ detalle: "Gianduia", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1), (2, $2)`, [pt1.idProd, pt2.idProd]);
    await query(`UPDATE malaga.d_productos SET stock_minimo = 4, lote_optimo = 4 WHERE id_prod IN ($1, $2)`, [
      pt1.idProd,
      pt2.idProd,
    ]);

    const { createReceta } = await import("../recetas/queries");
    await createReceta({ idProd: pt1.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }], userAlta });
    await createReceta({ idProd: pt2.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }], userAlta });

    const filas = await calcularPlanManana();
    const filaSemi = filas.find((f) => f.idProd === semi.idProd)!;
    // Cada PT necesita 4kg (su stock mínimo, sin stock actual) -> 0.5 * 4 + 0.5 * 4 = 4kg de base.
    expect(filaSemi.demandaPronosticada).toBeCloseTo(4, 5);
    expect(filaSemi.tipoProducto).toBe("SEMI");
  });

  it("un sabor con cantidad_a_planificar 0 no le pide nada a sus bases", async () => {
    const userAlta = (
      await query<{ id_user: number }>(
        `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com','x','admin') RETURNING id_user`
      )
    ).rows[0].id_user;

    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [pt.idProd]);
    // Sin stock mínimo ni historial: cantidad_a_planificar = 0.

    const { createReceta } = await import("../recetas/queries");
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }], userAlta });

    const filas = await calcularPlanManana();
    expect(filas.find((f) => f.idProd === semi.idProd)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: FAIL — `calcularPlanManana` doesn't exist yet.

- [ ] **Step 3: Add to `src/lib/pcp/queries.ts`**

Add this import at the top of the file (alongside the existing `import { query } from "../db";`):

```typescript
import { proyectarSiguiente, diaSemanaIso, calcularNecesario, calcularCantidadAPlanificar } from "./forecast";
```

Append at the end of the file:

```typescript
export interface FilaPlan {
  idProd: number;
  productoDetalle: string;
  tipoProducto: "PT" | "SEMI";
  demandaPronosticada: number;
  stockActual: number;
  stockMinimo: number;
  coccionesPendientes: number;
  necesario: number;
  cantidadAPlanificar: number;
}

export async function calcularPlanManana(factorPuntualSemana = 1): Promise<FilaPlan[]> {
  const semanas = await getExhibicionesPorSemana(8);
  const baseline = proyectarSiguiente(semanas.map((s) => s.total));

  const distribucionDia = await getDistribucionPorDia(8);
  const distribucionProducto = await getDistribucionPorProducto(8);
  const factoresDia = await getFactoresDia();
  const factorPorDia = new Map(factoresDia.map((f) => [f.diaSemana, f.factor]));

  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const diaManana = diaSemanaIso(manana);
  const pctDia = (distribucionDia[diaManana] ?? 0) * (factorPorDia.get(diaManana) ?? 1);

  const productosCartilla = await getProductosEnCartilla();
  const factoresProducto = await listFactoresProducto();
  const factorPorProducto = new Map(factoresProducto.map((f) => [f.idProd, f.factor]));
  const config = await getConfigTodosLosProductos();
  const stockPorProducto = await getStockActualPorProducto();
  const coccionesPorProducto = await getCoccionesPendientesPorProducto();

  const filasPt: FilaPlan[] = productosCartilla.map((prod) => {
    const pctProducto = (distribucionProducto[prod.idProd] ?? 0) * (factorPorProducto.get(prod.idProd) ?? 1);
    const demandaPronosticada = baseline * pctDia * pctProducto * factorPuntualSemana;
    const c = config.get(prod.idProd)!;
    const stockActual = stockPorProducto.get(prod.idProd) ?? 0;
    const coccionesPendientes = coccionesPorProducto.get(prod.idProd) ?? 0;
    const necesario = calcularNecesario({
      demanda: demandaPronosticada,
      stockActual,
      stockMinimo: c.stockMinimo,
      coccionesPendientes,
    });
    const cantidadAPlanificar = calcularCantidadAPlanificar({
      necesario,
      loteOptimo: c.loteOptimo,
      loteMinimo: c.loteMinimo,
    });
    return {
      idProd: prod.idProd,
      productoDetalle: prod.detalle,
      tipoProducto: "PT",
      demandaPronosticada,
      stockActual,
      stockMinimo: c.stockMinimo,
      coccionesPendientes,
      necesario,
      cantidadAPlanificar,
    };
  });

  const idsPtConProduccion = filasPt.filter((f) => f.cantidadAPlanificar > 0).map((f) => f.idProd);
  const itemsPorPt = await getItemsRecetaSemiPorProducto(idsPtConProduccion);
  const demandaSemi = new Map<number, number>();
  for (const fila of filasPt) {
    const items = itemsPorPt.get(fila.idProd);
    if (!items) continue;
    for (const item of items) {
      const acumulado = demandaSemi.get(item.idSubprod) ?? 0;
      demandaSemi.set(item.idSubprod, acumulado + Number(item.cantSubprod) * fila.cantidadAPlanificar);
    }
  }

  const filasSemi: FilaPlan[] = Array.from(demandaSemi.entries()).map(([idProdSemi, demanda]) => {
    const c = config.get(idProdSemi);
    const stockActual = stockPorProducto.get(idProdSemi) ?? 0;
    const coccionesPendientes = coccionesPorProducto.get(idProdSemi) ?? 0;
    const stockMinimo = c?.stockMinimo ?? 0;
    const necesario = calcularNecesario({ demanda, stockActual, stockMinimo, coccionesPendientes });
    const cantidadAPlanificar = calcularCantidadAPlanificar({
      necesario,
      loteOptimo: c?.loteOptimo ?? null,
      loteMinimo: c?.loteMinimo ?? null,
    });
    return {
      idProd: idProdSemi,
      productoDetalle: c?.detalle ?? `#${idProdSemi}`,
      tipoProducto: "SEMI",
      demandaPronosticada: demanda,
      stockActual,
      stockMinimo,
      coccionesPendientes,
      necesario,
      cantidadAPlanificar,
    };
  });

  return [...filasPt, ...filasSemi];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: PASS (17 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/queries.ts src/lib/pcp/queries.test.ts
git commit -m "Add calcularPlanManana: full PT forecast + SEMI recipe explosion orchestration"
```

---

### Task 11: `generarPlanManana` — crear las OPs y el snapshot histórico

**Files:**
- Modify: `src/lib/pcp/queries.ts`
- Modify: `src/lib/pcp/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/pcp/queries.test.ts`:

```typescript
import { generarPlanManana } from "./queries";
import { listOrdenes } from "../ordenes/queries";

describe("generarPlanManana", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_pcp_pronostico, malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("crea una OP por cada fila con cantidad > 0 y ninguna para las de cantidad 0", async () => {
    const userGenerado = await seedUser();
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });

    const { idsOp } = await generarPlanManana(
      [
        {
          idProd: p1.idProd,
          tipoProducto: "PT",
          cantidadAPlanificar: 8,
          demandaPronosticada: 7.5,
          stockActual: 0,
          stockMinimo: 4,
          coccionesPendientes: 0,
          necesario: 7.5,
        },
        {
          idProd: p2.idProd,
          tipoProducto: "PT",
          cantidadAPlanificar: 0,
          demandaPronosticada: 0,
          stockActual: 10,
          stockMinimo: 4,
          coccionesPendientes: 0,
          necesario: -6,
        },
      ],
      "2026-08-06",
      null,
      userGenerado
    );

    expect(idsOp).toHaveLength(1);
    const ordenes = await listOrdenes();
    expect(ordenes.find((o) => o.idProd === p1.idProd)?.cantPlan).toBe("8.000");
    expect(ordenes.find((o) => o.idProd === p2.idProd)).toBeUndefined();
  });

  it("guarda un snapshot en f_pcp_pronostico por cada fila, con o sin OP generada", async () => {
    const userGenerado = await seedUser();
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });

    await generarPlanManana(
      [
        {
          idProd: p.idProd,
          tipoProducto: "PT",
          cantidadAPlanificar: 0,
          demandaPronosticada: 1,
          stockActual: 10,
          stockMinimo: 4,
          coccionesPendientes: 0,
          necesario: -5,
        },
      ],
      "2026-08-06",
      1.2,
      userGenerado
    );

    const snapshot = await query<{ id_op_generada: number | null; factor_puntual_semana: string | null }>(
      `SELECT id_op_generada, factor_puntual_semana FROM malaga.f_pcp_pronostico WHERE id_prod = $1`,
      [p.idProd]
    );
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].id_op_generada).toBeNull();
    expect(Number(snapshot.rows[0].factor_puntual_semana)).toBeCloseTo(1.2, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: FAIL — `generarPlanManana` doesn't exist yet.

- [ ] **Step 3: Add to `src/lib/pcp/queries.ts`**

Add this import at the top:

```typescript
import { createOrdenProduccion } from "../ordenes/queries";
```

Append:

```typescript
export interface FilaConfirmada {
  idProd: number;
  tipoProducto: "PT" | "SEMI";
  cantidadAPlanificar: number;
  demandaPronosticada: number;
  stockActual: number;
  stockMinimo: number;
  coccionesPendientes: number;
  necesario: number;
}

export async function generarPlanManana(
  filas: FilaConfirmada[],
  fechaPlan: string,
  factorPuntualSemana: number | null,
  userGenerado: number
): Promise<{ idsOp: number[] }> {
  const idsOp: number[] = [];

  for (const fila of filas) {
    let idOp: number | null = null;
    if (fila.cantidadAPlanificar > 0) {
      const creada = await createOrdenProduccion({
        idProd: fila.idProd,
        cantPlan: fila.cantidadAPlanificar,
        fechaPlan,
      });
      idOp = creada.idOp;
      idsOp.push(idOp);
    }

    await query(
      `INSERT INTO malaga.f_pcp_pronostico
         (fecha_plan, id_prod, demanda_pronosticada, stock_actual_momento, stock_minimo_momento,
          cocciones_pendientes_momento, necesario, cantidad_planificada, factor_puntual_semana,
          id_op_generada, user_generado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        fechaPlan,
        fila.idProd,
        fila.demandaPronosticada,
        fila.stockActual,
        fila.stockMinimo,
        fila.coccionesPendientes,
        fila.necesario,
        fila.cantidadAPlanificar,
        factorPuntualSemana,
        idOp,
        userGenerado,
      ]
    );
  }

  return { idsOp };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:db -- pcp/queries.test.ts`
Expected: PASS (19 tests total)

- [ ] **Step 5: Type-check and lint the whole `pcp` module**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pcp/queries.ts src/lib/pcp/queries.test.ts
git commit -m "Add generarPlanManana: batch-create OPs from a confirmed plan, with historical snapshot"
```

---

### Task 12: Pantalla `/pcp` — revisión y generación del plan

**Files:**
- Create: `src/app/(app)/pcp/page.tsx`
- Create: `src/app/(app)/pcp/PlanRevisionForm.tsx`
- Create: `src/app/(app)/pcp/actions.ts`

- [ ] **Step 1: Create the server action**

```typescript
// src/app/(app)/pcp/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { generarPlanManana, type FilaConfirmada } from "@/lib/pcp/queries";

function manana(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function generarPlanAction(
  _prevState: { error?: string; ok?: boolean; cantidadOps?: number } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin"]);

  const idsProd = formData.getAll("idProd").map(Number);
  const tipos = formData.getAll("tipoProducto") as ("PT" | "SEMI")[];
  const cantidades = formData.getAll("cantidadAPlanificar").map(Number);
  const demandas = formData.getAll("demandaPronosticada").map(Number);
  const stocks = formData.getAll("stockActual").map(Number);
  const minimos = formData.getAll("stockMinimo").map(Number);
  const pendientes = formData.getAll("coccionesPendientes").map(Number);
  const necesarios = formData.getAll("necesario").map(Number);
  const factorPuntualRaw = String(formData.get("factorPuntualSemana") ?? "").trim();
  const factorPuntualSemana = factorPuntualRaw ? Number(factorPuntualRaw) : null;

  if (idsProd.length === 0) {
    return { error: "No hay filas para generar." };
  }

  const filas: FilaConfirmada[] = idsProd.map((idProd, i) => ({
    idProd,
    tipoProducto: tipos[i],
    cantidadAPlanificar: cantidades[i],
    demandaPronosticada: demandas[i],
    stockActual: stocks[i],
    stockMinimo: minimos[i],
    coccionesPendientes: pendientes[i],
    necesario: necesarios[i],
  }));

  try {
    const { idsOp } = await generarPlanManana(filas, manana(), factorPuntualSemana, user.idUser);
    revalidatePath("/ordenes");
    revalidatePath("/pcp");
    return { ok: true, cantidadOps: idsOp.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo generar el plan." };
  }
}
```

**Important:** the "factor puntual de esta semana" is not a client-side multiplier on top of the table — it changes `demandaPronosticada`/`necesario` themselves, which only `calcularPlanManana` (server-side) can compute. So it can't live inside the generation form as a free-floating input: if it did, submitting would send the *original* (factor=1) `demandaPronosticada`/`necesario` hidden fields alongside whatever factor the user just typed, silently decoupling the displayed numbers from what gets confirmed. Instead, the factor is a URL search param (`?factor=1.2`) that the page reads server-side before calling `calcularPlanManana`, with its own small "Recalcular" GET form separate from the "Generar plan" POST form. The generation form's hidden `factorPuntualSemana` field then just echoes the factor that was *actually used* to produce the table on screen — never a stale or unapplied one.

- [ ] **Step 2: Create the review form (client component)**

```tsx
// src/app/(app)/pcp/PlanRevisionForm.tsx
"use client";

import { useActionState, useState } from "react";
import { generarPlanAction } from "./actions";
import type { FilaPlan } from "@/lib/pcp/queries";

function FilaEditable({ fila }: { fila: FilaPlan }) {
  const [cantidad, setCantidad] = useState(fila.cantidadAPlanificar);

  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
      <td className="px-3.5 py-2.5 font-medium text-ink">{fila.productoDetalle}</td>
      <td className="px-3.5 py-2.5 text-ink-soft">{fila.tipoProducto}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.demandaPronosticada.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.stockActual.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.stockMinimo.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.coccionesPendientes.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.necesario.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right">
        <input type="hidden" name="idProd" value={fila.idProd} />
        <input type="hidden" name="tipoProducto" value={fila.tipoProducto} />
        <input type="hidden" name="demandaPronosticada" value={fila.demandaPronosticada} />
        <input type="hidden" name="stockActual" value={fila.stockActual} />
        <input type="hidden" name="stockMinimo" value={fila.stockMinimo} />
        <input type="hidden" name="coccionesPendientes" value={fila.coccionesPendientes} />
        <input type="hidden" name="necesario" value={fila.necesario} />
        <input
          name="cantidadAPlanificar"
          type="number"
          step="0.001"
          value={cantidad}
          onChange={(e) => setCantidad(Number(e.target.value))}
          className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
        />
      </td>
    </tr>
  );
}

export function PlanRevisionForm({ filas, factor }: { filas: FilaPlan[]; factor: number }) {
  const [state, formAction, pending] = useActionState(generarPlanAction, undefined);
  const pt = filas.filter((f) => f.tipoProducto === "PT");
  const semi = filas.filter((f) => f.tipoProducto === "SEMI");

  if (state?.ok) {
    return (
      <div className="card p-5 text-sm text-ink">
        Plan generado: {state.cantidadOps} OP{state.cantidadOps === 1 ? "" : "s"} creada
        {state.cantidadOps === 1 ? "" : "s"} para mañana. Se ven y gestionan desde{" "}
        <a href="/ordenes" className="font-semibold text-copper hover:text-copper-strong">
          Órdenes
        </a>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action="/pcp" method="GET" className="flex items-end gap-2">
        <label className="flex max-w-xs flex-col gap-1 text-xs text-ink">
          Factor puntual de esta semana (1 = sin ajuste)
          <input
            name="factor"
            type="number"
            step="0.01"
            defaultValue={factor}
            className="rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-copper hover:text-copper"
        >
          Recalcular
        </button>
      </form>

      <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="factorPuntualSemana" value={factor} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
              <th className="px-3.5 py-2.5">Producto</th>
              <th className="px-3.5 py-2.5">Tipo</th>
              <th className="px-3.5 py-2.5 text-right">Demanda pronosticada</th>
              <th className="px-3.5 py-2.5 text-right">Stock actual</th>
              <th className="px-3.5 py-2.5 text-right">Stock mínimo</th>
              <th className="px-3.5 py-2.5 text-right">Pendientes</th>
              <th className="px-3.5 py-2.5 text-right">Necesario</th>
              <th className="px-3.5 py-2.5 text-right">A planificar</th>
            </tr>
          </thead>
          <tbody>
            {pt.map((fila) => (
              <FilaEditable key={fila.idProd} fila={fila} />
            ))}
            {semi.map((fila) => (
              <FilaEditable key={fila.idProd} fila={fila} />
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3.5 py-8 text-center text-ink-soft">
                  No hay sabores en la cartilla todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || filas.length === 0}
        className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
      >
        {pending ? "Generando..." : "Generar plan de mañana"}
      </button>
      </form>
    </div>
  );
}
```

The "cantidad a planificar" input intentionally has no `required`/min constraint — per the project's established "never block" philosophy (see `finalizarOrden`'s comments), a user overriding a suggested quantity to something the formula didn't produce is a valid correction, not an error.

- [ ] **Step 3: Create the page**

```tsx
// src/app/(app)/pcp/page.tsx
import { requireRole } from "@/lib/auth/requireRole";
import { calcularPlanManana } from "@/lib/pcp/queries";
import { PlanRevisionForm } from "./PlanRevisionForm";

export default async function PcpPage({
  searchParams,
}: {
  searchParams: Promise<{ factor?: string }>;
}) {
  await requireRole(["gestion", "admin"]);
  const { factor: factorRaw } = await searchParams;
  const factor = factorRaw ? Number(factorRaw) : 1;
  const filas = await calcularPlanManana(factor);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6">
        <p className="page-eyebrow mb-1">Cierre del día</p>
        <h1 className="text-xl font-semibold text-ink">PCP — Plan de mañana</h1>
      </div>

      <PlanRevisionForm filas={filas} factor={factor} />
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 5: Manual verification in the browser**

Start the dev server (`preview_start` with the `malaga-soft` launch config, or `npm run dev`), log in as an admin/gestión user, navigate to `/pcp`. Confirm:
- The table renders one row per sabor currently in the cartilla, plus rows for any bases their recipes pull in.
- Editing a "A planificar" quantity and submitting shows the "Plan generado: N OPs..." confirmation.
- The new OPs appear in `/ordenes` with `fecha_plan` = tomorrow and `estado = planificada`.
- A user with role `produccion` gets redirected away from `/pcp` (per `requireRole`).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/pcp/
git commit -m "Add /pcp review-and-generate screen for tomorrow's production plan"
```

---

### Task 13: Pantalla de edición de factores

**Files:**
- Create: `src/app/(app)/pcp/factores/page.tsx`
- Create: `src/app/(app)/pcp/factores/actions.ts`

- [ ] **Step 1: Create the server actions**

```typescript
// src/app/(app)/pcp/factores/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { setFactorDia, setFactorProducto } from "@/lib/pcp/queries";

export async function actualizarFactorDiaAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const diaSemana = Number(formData.get("diaSemana"));
  const factor = Number(formData.get("factor"));
  if (!diaSemana || Number.isNaN(factor) || factor < 0) return;

  await setFactorDia(diaSemana, factor);
  revalidatePath("/pcp/factores");
}

export async function actualizarFactorProductoAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idProd = Number(formData.get("idProd"));
  const factor = Number(formData.get("factor"));
  if (!idProd || Number.isNaN(factor) || factor < 0) return;

  await setFactorProducto(idProd, factor);
  revalidatePath("/pcp/factores");
}
```

- [ ] **Step 2: Create the page**

```tsx
// src/app/(app)/pcp/factores/page.tsx
import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { getFactoresDia, listFactoresProducto } from "@/lib/pcp/queries";
import { IconChevronLeft } from "@/components/icons";
import { actualizarFactorDiaAction, actualizarFactorProductoAction } from "./actions";

const DIA_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export default async function FactoresPcpPage() {
  await requireRole(["gestion", "admin"]);
  const [factoresDia, factoresProducto] = await Promise.all([getFactoresDia(), listFactoresProducto()]);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <Link
        href="/pcp"
        className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-copper"
      >
        <IconChevronLeft /> PCP
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-ink">Factores de ajuste</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Por día de la semana</h2>
          <div className="card flex flex-col gap-2 p-4">
            {factoresDia.map((f) => (
              <form
                key={f.diaSemana}
                action={actualizarFactorDiaAction}
                className="flex items-center justify-between gap-2"
              >
                <input type="hidden" name="diaSemana" value={f.diaSemana} />
                <span className="text-sm text-ink">{DIA_LABEL[f.diaSemana]}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    name="factor"
                    type="number"
                    step="0.01"
                    defaultValue={f.factor}
                    className="w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                  />
                  <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                    Guardar
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Por producto</h2>
          <div className="card flex max-h-[28rem] flex-col gap-2 overflow-y-auto p-4">
            {factoresProducto.map((f) => (
              <form
                key={f.idProd}
                action={actualizarFactorProductoAction}
                className="flex items-center justify-between gap-2"
              >
                <input type="hidden" name="idProd" value={f.idProd} />
                <span className="truncate text-sm text-ink">{f.productoDetalle}</span>
                <div className="flex flex-none items-center gap-1.5">
                  <input
                    name="factor"
                    type="number"
                    step="0.01"
                    defaultValue={f.factor}
                    className="w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                  />
                  <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                    Guardar
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Navigate to `/pcp/factores`, change a day's factor (e.g. sábado to 1.15) and a product's factor, confirm they persist after a page reload, and confirm the next `/pcp` generation reflects the change (the demanda for that day/product should scale accordingly).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/pcp/factores/
git commit -m "Add /pcp/factores screen to edit persistent day-of-week and product factors"
```

---

### Task 14: Navegación

**Files:**
- Modify: `src/components/icons.tsx`
- Modify: `src/app/(app)/navItems.ts`

- [ ] **Step 1: Add an icon**

In `src/components/icons.tsx`, append:

```tsx
export function IconTrendUp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 16.5 10 10l4 4 6.5-6.5" />
      <path d="M15 7.5h5.5V13" />
    </svg>
  );
}
```

- [ ] **Step 2: Register the nav item**

In `src/app/(app)/navItems.ts`, add `IconTrendUp` to the import from `@/components/icons`, and add a new entry to `NAV_ITEMS` right after Cartilla actual:

```typescript
  { href: "/planificacion", label: "Cartilla actual", icon: IconTarget },
  { href: "/pcp", label: "PCP", icon: IconTrendUp },
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Confirm "PCP" shows up in the sidebar (desktop) and inside the "Más" sheet on mobile (`src/app/(app)/MobileNav.tsx`'s `PRIMARY_HREFS` doesn't need to include `/pcp` — it's fine as an overflow item, matching how "Cartilla actual" and "Recetas" are handled today).

- [ ] **Step 5: Commit**

```bash
git add src/components/icons.tsx src/app/\(app\)/navItems.ts
git commit -m "Add PCP to navigation"
```

---

### Task 15: Verificación completa de Fase 1

- [ ] **Step 1: Full test suite (pure + DB)**

Confirm with the user in this session that it's safe to run destructive tests before doing this (per `vitest.setup.ts`'s gate) — if the user already gave blanket permission earlier in the session, proceed; otherwise ask first.

Run: `npm test` (pure tests only, no gate)
Expected: PASS, including all of `src/lib/pcp/forecast.test.ts`.

Run: `npm run test:db` (full suite, DB-gated)
Expected: PASS, all suites including `src/lib/pcp/queries.test.ts`.

If any destructive test truncates real data, re-run the project's import scripts (`scripts/import-historico.ts`, `scripts/import-recetas.ts`) or otherwise restore state before continuing — same as every prior round in this project.

- [ ] **Step 2: End-to-end manual walkthrough**

In the browser: set a `stock_minimo`/`lote_optimo`/`lote_minimo` on a real product from `/productos/<id>`, visit `/pcp`, confirm it appears with a nonzero suggestion, generate the plan, confirm the OP shows up in `/ordenes`, and confirm `f_pcp_pronostico` has a matching row (`SELECT * FROM malaga.f_pcp_pronostico ORDER BY id_pronostico DESC LIMIT 5` via a throwaway script or `psql`).

- [ ] **Step 3: Final Fase 1 commit (if anything changed during verification)**

```bash
git add -A
git commit -m "Fase 1 of PCP verified end-to-end"
```

Fase 1 is done and usable at this point — stop here if you want to ship it before starting Fase 2.

---

## Fase 2 — Dashboard de estadísticas

### Task 16: Clima — Open-Meteo

**Files:**
- Create: `src/lib/pcp/weather.ts`
- Test: `src/lib/pcp/weather.test.ts`

Split the fetch (untestable without hitting the network) from the response parsing (pure, testable).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/pcp/weather.test.ts
import { describe, it, expect } from "vitest";
import { parsePronosticoOpenMeteo } from "./weather";

describe("parsePronosticoOpenMeteo", () => {
  it("mapea la respuesta diaria de Open-Meteo a un arreglo simple", () => {
    const respuesta = {
      daily: {
        time: ["2026-08-06", "2026-08-07"],
        temperature_2m_max: [31.2, 29.8],
        temperature_2m_min: [22.1, 21.5],
        precipitation_probability_max: [5, 40],
        weather_code: [1, 61],
      },
    };

    const dias = parsePronosticoOpenMeteo(respuesta);
    expect(dias).toEqual([
      { fecha: "2026-08-06", tempMax: 31.2, tempMin: 22.1, probabilidadLluvia: 5, condicion: "Mayormente despejado" },
      { fecha: "2026-08-07", tempMax: 29.8, tempMin: 21.5, probabilidadLluvia: 40, condicion: "Lluvia ligera" },
    ]);
  });

  it("con un weather_code desconocido, devuelve un texto genérico", () => {
    const respuesta = {
      daily: {
        time: ["2026-08-06"],
        temperature_2m_max: [30],
        temperature_2m_min: [20],
        precipitation_probability_max: [0],
        weather_code: [9999],
      },
    };
    expect(parsePronosticoOpenMeteo(respuesta)[0].condicion).toBe("—");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pcp/weather.test.ts`
Expected: FAIL — `src/lib/pcp/weather.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/pcp/weather.ts

// Málaga centro.
const LATITUD = 36.7213;
const LONGITUD = -4.4214;

const CONDICION_POR_CODIGO: Record<number, string> = {
  0: "Despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla con escarcha",
  51: "Llovizna ligera",
  53: "Llovizna",
  55: "Llovizna intensa",
  61: "Lluvia ligera",
  63: "Lluvia",
  65: "Lluvia intensa",
  71: "Nieve ligera",
  73: "Nieve",
  75: "Nieve intensa",
  80: "Chubascos ligeros",
  81: "Chubascos",
  82: "Chubascos intensos",
  95: "Tormenta",
};

export interface DiaClima {
  fecha: string;
  tempMax: number;
  tempMin: number;
  probabilidadLluvia: number;
  condicion: string;
}

interface RespuestaOpenMeteo {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
}

export function parsePronosticoOpenMeteo(respuesta: RespuestaOpenMeteo): DiaClima[] {
  return respuesta.daily.time.map((fecha, i) => ({
    fecha,
    tempMax: respuesta.daily.temperature_2m_max[i],
    tempMin: respuesta.daily.temperature_2m_min[i],
    probabilidadLluvia: respuesta.daily.precipitation_probability_max[i],
    condicion: CONDICION_POR_CODIGO[respuesta.daily.weather_code[i]] ?? "—",
  }));
}

export async function getPronosticoClima(): Promise<DiaClima[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LATITUD}&longitude=${LONGITUD}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
    `&timezone=Europe%2FMadrid&forecast_days=7`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = (await res.json()) as RespuestaOpenMeteo;
  return parsePronosticoOpenMeteo(data);
}
```

`getPronosticoClima` fails soft (empty array, not a thrown error) if Open-Meteo is unreachable — weather is a nice-to-have insight, not something that should break the PCP page if the shop's internet hiccups.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pcp/weather.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/weather.ts src/lib/pcp/weather.test.ts
git commit -m "Add Open-Meteo weather forecast for Malaga (parser unit-tested, fetch fails soft)"
```

---

### Task 17: Estadísticas — tendencia, distribuciones e insights

**Files:**
- Create: `src/lib/pcp/stats.ts`
- Test: `src/lib/pcp/stats.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/pcp/stats.test.ts
import { describe, it, expect } from "vitest";
import { generarInsights } from "./stats";

describe("generarInsights", () => {
  it("señala el día de mayor demanda relativo al promedio", () => {
    const insights = generarInsights({
      distribucionDia: { 1: 0.1, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.15, 6: 0.25, 7: 0.2 },
      distribucionProducto: { 1: 0.3, 2: 0.2 },
      productosDetalle: { 1: "Pistacho", 2: "Vainilla" },
      pendiente: 0,
    });
    expect(insights.some((i) => i.includes("Sábado"))).toBe(true);
  });

  it("señala el producto de mayor rotación", () => {
    const insights = generarInsights({
      distribucionDia: {},
      distribucionProducto: { 1: 0.3, 2: 0.2 },
      productosDetalle: { 1: "Pistacho", 2: "Vainilla" },
      pendiente: 0,
    });
    expect(insights.some((i) => i.includes("Pistacho"))).toBe(true);
  });

  it("señala tendencia creciente cuando la pendiente es positiva", () => {
    const insights = generarInsights({
      distribucionDia: {},
      distribucionProducto: {},
      productosDetalle: {},
      pendiente: 5,
    });
    expect(insights.some((i) => i.toLowerCase().includes("creciente"))).toBe(true);
  });

  it("sin datos, no rompe (devuelve arreglo vacío o solo insights que no dependen de datos)", () => {
    const insights = generarInsights({ distribucionDia: {}, distribucionProducto: {}, productosDetalle: {}, pendiente: 0 });
    expect(Array.isArray(insights)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pcp/stats.test.ts`
Expected: FAIL — `src/lib/pcp/stats.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/pcp/stats.ts
import { query } from "../db";
import { regresionLineal, proyectarSiguiente } from "./forecast";
import { getExhibicionesPorSemana, getDistribucionPorDia, getDistribucionPorProducto } from "./queries";

const DIA_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export interface TendenciaSemanal {
  semana: string;
  total: number;
}

export interface Tendencia {
  puntos: TendenciaSemanal[];
  proyeccionSemanaSiguiente: number;
  pendiente: number;
}

export async function getTendenciaSemanal(): Promise<Tendencia> {
  const semanas = await getExhibicionesPorSemana(8);
  const totales = semanas.map((s) => s.total);
  const { pendiente } = regresionLineal(totales);
  return {
    puntos: semanas,
    proyeccionSemanaSiguiente: proyectarSiguiente(totales),
    pendiente,
  };
}

export interface InsightsInput {
  distribucionDia: Record<number, number>;
  distribucionProducto: Record<number, number>;
  productosDetalle: Record<number, string>;
  pendiente: number;
}

export function generarInsights(input: InsightsInput): string[] {
  const insights: string[] = [];

  const diasConDatos = Object.entries(input.distribucionDia);
  if (diasConDatos.length > 0) {
    const promedio = diasConDatos.reduce((acc, [, pct]) => acc + pct, 0) / diasConDatos.length;
    const [diaTop, pctTop] = diasConDatos.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (promedio > 0) {
      const diferencia = Math.round(((pctTop - promedio) / promedio) * 100);
      insights.push(
        `${DIA_LABEL[Number(diaTop)]} es tu día de mayor demanda, ${diferencia}% por encima del promedio.`
      );
    }
  }

  const productosConDatos = Object.entries(input.distribucionProducto);
  if (productosConDatos.length > 0) {
    const [idTop, pctTop] = productosConDatos.reduce((a, b) => (b[1] > a[1] ? b : a));
    const nombre = input.productosDetalle[Number(idTop)] ?? `#${idTop}`;
    insights.push(`${nombre} es tu sabor de mayor rotación (${(pctTop * 100).toFixed(1)}% de la demanda total).`);
  }

  if (input.pendiente > 0.01) {
    insights.push("La demanda semanal viene con tendencia creciente en las últimas 8 semanas.");
  } else if (input.pendiente < -0.01) {
    insights.push("La demanda semanal viene con tendencia decreciente en las últimas 8 semanas.");
  }

  return insights;
}

export interface FilaPronosticoVsReal {
  fechaPlan: string;
  productoDetalle: string;
  demandaPronosticada: number;
  cantidadPlanificada: number;
  cantReal: string | null;
}

export async function listPronosticoVsReal(limite = 30): Promise<FilaPronosticoVsReal[]> {
  const result = await query<{
    fecha_plan: string;
    producto_detalle: string;
    demanda_pronosticada: string;
    cantidad_planificada: string;
    cant_real: string | null;
  }>(
    `SELECT f.fecha_plan::text AS fecha_plan, p.detalle AS producto_detalle, f.demanda_pronosticada,
            f.cantidad_planificada, o.cant_real
     FROM malaga.f_pcp_pronostico f
     JOIN malaga.d_productos p ON p.id_prod = f.id_prod
     LEFT JOIN malaga.f_ordenes_produccion o ON o.id_op = f.id_op_generada
     WHERE f.cantidad_planificada > 0
     ORDER BY f.ts_generado DESC
     LIMIT $1`,
    [limite]
  );
  return result.rows.map((r) => ({
    fechaPlan: r.fecha_plan,
    productoDetalle: r.producto_detalle,
    demandaPronosticada: Number(r.demanda_pronosticada),
    cantidadPlanificada: Number(r.cantidad_planificada),
    cantReal: r.cant_real,
  }));
}

export { getDistribucionPorDia, getDistribucionPorProducto };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pcp/stats.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add a DB-gated test for `listPronosticoVsReal`**

Add to a new `src/lib/pcp/stats.db.test.ts` (separate file so the fast pure tests in `stats.test.ts` stay ungated):

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { listPronosticoVsReal } from "./stats";

describe("listPronosticoVsReal", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_pcp_pronostico, malaga.f_ordenes_produccion, malaga.d_productos RESTART IDENTITY CASCADE"
    );
  });

  it("solo trae filas con cantidad_planificada > 0, más recientes primero", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.f_pcp_pronostico
         (fecha_plan, id_prod, demanda_pronosticada, stock_actual_momento, stock_minimo_momento,
          cocciones_pendientes_momento, necesario, cantidad_planificada, ts_generado)
       VALUES ('2026-08-05', $1, 5, 0, 4, 0, 5, 0, now() - interval '1 day'),
              ('2026-08-06', $1, 6, 0, 4, 0, 6, 8, now())`,
      [p.idProd]
    );

    const filas = await listPronosticoVsReal();
    expect(filas).toHaveLength(1);
    expect(filas[0].fechaPlan).toBe("2026-08-06");
    expect(filas[0].cantidadPlanificada).toBe(8);
  });
});
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm run test:db -- pcp/stats.db.test.ts`
Expected: PASS (1 test)

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pcp/stats.ts src/lib/pcp/stats.test.ts src/lib/pcp/stats.db.test.ts
git commit -m "Add PCP stats: weekly trend, insights templates, pronostico-vs-real query"
```

---

### Task 18: Componentes de gráfico (SVG a mano, sin dependencias nuevas)

**Files:**
- Create: `src/app/(app)/pcp/charts/TrendChart.tsx`
- Create: `src/app/(app)/pcp/charts/BarDistribution.tsx`

- [ ] **Step 1: Trend chart**

```tsx
// src/app/(app)/pcp/charts/TrendChart.tsx
import type { TendenciaSemanal } from "@/lib/pcp/stats";
import { formatFecha } from "@/lib/formatDate";

export function TrendChart({
  puntos,
  proyeccion,
}: {
  puntos: TendenciaSemanal[];
  proyeccion: number;
}) {
  if (puntos.length === 0) {
    return <p className="card py-8 text-center text-sm text-ink-soft">Todavía no hay suficiente historial.</p>;
  }

  const valores = [...puntos.map((p) => p.total), proyeccion];
  const max = Math.max(...valores, 1);
  const width = 640;
  const height = 180;
  const paddingX = 24;
  const paddingY = 16;
  const step = (width - paddingX * 2) / valores.length;

  const puntosSvg = valores.map((v, i) => {
    const x = paddingX + i * step;
    const y = height - paddingY - (v / max) * (height - paddingY * 2);
    return { x, y };
  });

  const path = puntosSvg.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const ultimoReal = puntosSvg[puntosSvg.length - 2];
  const proyectado = puntosSvg[puntosSvg.length - 1];

  return (
    <div className="card p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Tendencia semanal de demanda">
        <path d={path} fill="none" stroke="var(--copper)" strokeWidth={2} />
        {puntosSvg.slice(0, -1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--copper)" />
        ))}
        {ultimoReal && proyectado && (
          <line
            x1={ultimoReal.x}
            y1={ultimoReal.y}
            x2={proyectado.x}
            y2={proyectado.y}
            stroke="var(--warn)"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
        {proyectado && <circle cx={proyectado.x} cy={proyectado.y} r={4} fill="var(--warn)" />}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-ink-soft">
        <span>{formatFecha(puntos[0]?.semana)}</span>
        <span className="font-medium text-warn">Proyección: {proyeccion.toFixed(1)}kg</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Bar distribution chart**

```tsx
// src/app/(app)/pcp/charts/BarDistribution.tsx
export function BarDistribution({ items }: { items: { label: string; pct: number }[] }) {
  const max = Math.max(...items.map((i) => i.pct), 0.0001);

  return (
    <div className="card flex flex-col gap-1.5 p-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-28 flex-none truncate text-xs text-ink-soft">{item.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-copper" style={{ width: `${(item.pct / max) * 100}%` }} />
          </div>
          <span className="w-12 flex-none text-right font-mono text-[10.5px] text-ink-soft">
            {(item.pct * 100).toFixed(1)}%
          </span>
        </div>
      ))}
      {items.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">Sin datos todavía.</p>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/pcp/charts/
git commit -m "Add hand-rolled SVG trend and distribution charts for the PCP dashboard"
```

---

### Task 19: Pestaña de estadísticas en `/pcp`

**Files:**
- Create: `src/app/(app)/pcp/EstadisticasTab.tsx`
- Modify: `src/app/(app)/pcp/page.tsx`

- [ ] **Step 1: Build the stats tab (server component, fetches its own data)**

```tsx
// src/app/(app)/pcp/EstadisticasTab.tsx
import { getTendenciaSemanal, generarInsights, listPronosticoVsReal } from "@/lib/pcp/stats";
import { getDistribucionPorDia, getDistribucionPorProducto, getProductosEnCartilla } from "@/lib/pcp/queries";
import { getPronosticoClima } from "@/lib/pcp/weather";
import { formatFecha } from "@/lib/formatDate";
import { TrendChart } from "./charts/TrendChart";
import { BarDistribution } from "./charts/BarDistribution";

const DIA_LABEL: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
  7: "Dom",
};

export async function EstadisticasTab() {
  const [tendencia, distribucionDia, distribucionProducto, productosCartilla, clima, pronosticoVsReal] =
    await Promise.all([
      getTendenciaSemanal(),
      getDistribucionPorDia(8),
      getDistribucionPorProducto(8),
      getProductosEnCartilla(),
      getPronosticoClima(),
      listPronosticoVsReal(15),
    ]);

  const productosDetalle = Object.fromEntries(productosCartilla.map((p) => [p.idProd, p.detalle]));
  const insights = generarInsights({
    distribucionDia,
    distribucionProducto,
    productosDetalle,
    pendiente: tendencia.pendiente,
  });

  const itemsDia = Object.entries(distribucionDia)
    .map(([dia, pct]) => ({ label: DIA_LABEL[Number(dia)], pct }))
    .sort((a, b) => Number(a.label) - Number(b.label));
  const itemsProducto = Object.entries(distribucionProducto)
    .map(([idProd, pct]) => ({ label: productosDetalle[Number(idProd)] ?? `#${idProd}`, pct }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="flex flex-col gap-6">
      {insights.length > 0 && (
        <section className="card flex flex-col gap-1.5 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Insights</h2>
          <ul className="flex flex-col gap-1 text-sm text-ink">
            {insights.map((insight, i) => (
              <li key={i}>• {insight}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Tendencia semanal (8 semanas)</h2>
        <TrendChart puntos={tendencia.puntos} proyeccion={tendencia.proyeccionSemanaSiguiente} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Demanda por día de la semana</h2>
          <BarDistribution items={itemsDia} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Demanda por producto</h2>
          <BarDistribution items={itemsProducto} />
        </section>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Clima en Málaga</h2>
        <div className="card grid grid-cols-4 gap-2 p-4 sm:grid-cols-7">
          {clima.map((dia) => (
            <div key={dia.fecha} className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-[10px] text-ink-soft">{formatFecha(dia.fecha)}</span>
              <span className="font-mono text-sm font-semibold text-ink">{Math.round(dia.tempMax)}°</span>
              <span className="text-[10px] text-ink-soft">{Math.round(dia.tempMin)}°</span>
              <span className="text-[10px] text-ink-soft">{dia.condicion}</span>
            </div>
          ))}
          {clima.length === 0 && (
            <p className="col-span-full py-4 text-center text-sm text-ink-soft">
              No se pudo cargar el pronóstico ahora.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Pronóstico vs. real</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3.5 py-2.5">Fecha</th>
                <th className="px-3.5 py-2.5">Producto</th>
                <th className="px-3.5 py-2.5 text-right">Pronosticado</th>
                <th className="px-3.5 py-2.5 text-right">Planificado</th>
                <th className="px-3.5 py-2.5 text-right">Real</th>
              </tr>
            </thead>
            <tbody>
              {pronosticoVsReal.map((f, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3.5 py-2.5 text-ink-soft">{formatFecha(f.fechaPlan)}</td>
                  <td className="px-3.5 py-2.5 text-ink">{f.productoDetalle}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">
                    {f.demandaPronosticada.toFixed(2)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">
                    {f.cantidadPlanificada.toFixed(2)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{f.cantReal ?? "—"}</td>
                </tr>
              ))}
              {pronosticoVsReal.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3.5 py-6 text-center text-ink-soft">
                    Todavía no se generó ningún plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Wire tabs into the page**

Replace `src/app/(app)/pcp/page.tsx` entirely:

```tsx
// src/app/(app)/pcp/page.tsx
import { requireRole } from "@/lib/auth/requireRole";
import { calcularPlanManana } from "@/lib/pcp/queries";
import { PlanRevisionForm } from "./PlanRevisionForm";
import { EstadisticasTab } from "./EstadisticasTab";
import { PcpTabs } from "./PcpTabs";

export default async function PcpPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; factor?: string }>;
}) {
  await requireRole(["gestion", "admin"]);
  const { tab, factor: factorRaw } = await searchParams;
  const vistaEstadisticas = tab === "estadisticas";
  const factor = factorRaw ? Number(factorRaw) : 1;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-5">
        <p className="page-eyebrow mb-1">Cierre del día</p>
        <h1 className="text-xl font-semibold text-ink">PCP</h1>
      </div>

      <PcpTabs activa={vistaEstadisticas ? "estadisticas" : "plan"} />

      <div className="mt-5">
        {vistaEstadisticas ? (
          <EstadisticasTab />
        ) : (
          <PlanRevisionForm filas={await calcularPlanManana(factor)} factor={factor} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the tab switcher**

```tsx
// src/app/(app)/pcp/PcpTabs.tsx
import Link from "next/link";

export function PcpTabs({ activa }: { activa: "plan" | "estadisticas" }) {
  return (
    <div className="flex gap-1 border-b border-border">
      <Link
        href="/pcp"
        className={`px-3 py-2 text-sm font-medium transition-colors ${
          activa === "plan" ? "border-b-2 border-copper text-ink" : "text-ink-soft hover:text-ink"
        }`}
      >
        Plan de mañana
      </Link>
      <Link
        href="/pcp?tab=estadisticas"
        className={`px-3 py-2 text-sm font-medium transition-colors ${
          activa === "estadisticas" ? "border-b-2 border-copper text-ink" : "text-ink-soft hover:text-ink"
        }`}
      >
        Estadísticas
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Navigate to `/pcp` (default tab shows the plan review, unchanged from Fase 1) and `/pcp?tab=estadisticas` — confirm the trend chart, day/product bars, weather strip, insights, and pronóstico-vs-real table all render without errors (weather may show "No se pudo cargar el pronóstico ahora" if the sandboxed environment has no outbound internet — that's an acceptable, already-handled fallback, not a bug).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/pcp/
git commit -m "Add Estadisticas tab to /pcp: trend, distributions, weather, insights, pronostico vs real"
```

---

### Task 20: Verificación completa de Fase 2

- [ ] **Step 1: Full test suite**

Run: `npm test` (pure tests) then, with the same session-level confirmation as Task 15, `npm run test:db` (full suite).
Expected: PASS across the board.

- [ ] **Step 2: End-to-end manual walkthrough**

Generate at least two plans on different days (or manually insert a couple of extra `f_pcp_pronostico` rows for older dates) so the "Pronóstico vs. real" table and the trend chart have more than one data point to show. Confirm the dashboard reads sensibly.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "Fase 2 of PCP verified end-to-end"
```

---

## Self-review notes

- **Spec coverage:** §2.1–2.7 (baseline, distributions, factors, formulas, recipe explosion, generation flow) → Tasks 6–12. §3.1–3.4 (data model, retirement of old code) → Tasks 1–3, 5. §4 (dashboard) → Tasks 16–19. §5 (nav/permissions) → Task 14, and `requireRole(["gestion", "admin"])` baked into every `/pcp*` page and action throughout.
- **Type consistency:** `FilaPlan` (Task 10) and `FilaConfirmada` (Task 11) share every field except `FilaPlan` adds `productoDetalle`/`cantidadAPlanificar`-as-output vs `FilaConfirmada` taking it as input — the client component (Task 12) reads `FilaPlan` and posts back the same field names as hidden inputs, which `generarPlanAction` parses into `FilaConfirmada`. Verified the field names match exactly across `queries.ts`, `actions.ts`, and `PlanRevisionForm.tsx`.
- **No placeholders:** every task has complete, copy-pasteable code — no "add validation here" or "similar to Task N" shortcuts.

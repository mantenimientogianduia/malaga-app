# Cambio de Carta y Quiebres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the date-only automatic cartilla changeover with a manual, stock-aware confirmation flow, and add a new Quiebres (stockout) tracking module that closes automatically when a flavor is exhibited again.

**Architecture:** Fase A removes `aplicarCambiosVencidos()`'s automatic flip and moves the actual `id_prod`/`id_prod_ant`/`id_prod_fut` transition to an explicit human confirmation — either a checkbox shown when exhibiting the last pending batch of the outgoing flavor, or a manual "Oficializar cambio ahora" button on Cartilla actual. Exhibir starts matching pending batches to a position by either its current or its incoming flavor, so both can be exhibited to the same slot during the transition window. PCP's cartilla-membership query is extended the same way it already was for the "Nueva orden" warning. Fase B adds a new `f_quiebres` table and `/quiebres` module: a form to log a stockout (blocked if one's already open for that flavor), and automatic resolution wired into the same `exhibirPartida` transaction Fase A already made transactional.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind v4, PostgreSQL via raw parameterized SQL (`src/lib/db.ts`), node-pg-migrate, Vitest (destructive DB tests gated by `RUN_DESTRUCTIVE_DB_TESTS=true`).

**Specs:** `docs/superpowers/specs/2026-09-30-cambio-carta-design.md`, `docs/superpowers/specs/2026-09-30-quiebres-design.md` — both approved as written.

---

## Fase A — Cambio de carta

### Task 1: Eliminar el auto-flip por fecha

**Files:**
- Modify: `src/lib/exhibidora/queries.ts:16-30` (borra `aplicarCambiosVencidos` y su llamada)
- Modify: `src/lib/exhibidora/queries.test.ts:26-43` (borra el test del auto-flip)

- [ ] **Step 1: Borrar la función y su uso**

En `src/lib/exhibidora/queries.ts`, reemplazar:

```ts
// Un cambio programado se aplica solo (recorre id_prod -> id_prod_ant, id_prod_fut ->
// id_prod) la primera vez que alguien lee la cartilla en o después de la fecha elegida.
// No hay un cron separado: para un local con 2-3 personas que revisan la pantalla todos
// los días esto alcanza, sin necesitar infraestructura de jobs programados.
async function aplicarCambiosVencidos(): Promise<void> {
  await query(
    `UPDATE malaga.d_exhibidora
     SET id_prod_ant = id_prod, id_prod = id_prod_fut, id_prod_fut = NULL,
         ts_ulticambio = ts_cambio_programado, ts_cambio_programado = NULL
     WHERE id_prod_fut IS NOT NULL AND ts_cambio_programado::date <= CURRENT_DATE`
  );
}

export async function listCartillaActual(): Promise<CartillaSlot[]> {
  await aplicarCambiosVencidos();

  const result = await query<{
```

con:

```ts
export async function listCartillaActual(): Promise<CartillaSlot[]> {
  const result = await query<{
```

- [ ] **Step 2: Borrar el test del auto-flip**

En `src/lib/exhibidora/queries.test.ts`, borrar por completo este `it` (líneas 26-43):

```ts
  it("programar un cambio para hoy o antes se aplica al leer la cartilla, guardando el sabor anterior", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await programarCambio(idExhibidora, p2.idProd, "2026-08-05");

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p2.idProd);
    expect(slot.idProdAnt).toBe(p1.idProd);
    expect(slot.idProdFut).toBeNull();
    expect(slot.fechaCambioProgramado).toBeNull();
  });

```

El test siguiente ("un cambio programado para el futuro queda pendiente hasta esa fecha") queda intacto — sigue siendo válido, porque ahora TODO cambio programado queda pendiente hasta que se oficialice manualmente, sea cual sea la fecha.

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true npx vitest run src/lib/exhibidora/queries.test.ts`
Expected: PASS (el test de "queda pendiente hasta esa fecha" sigue pasando; ya no existe el del auto-flip).

- [ ] **Step 4: Commit**

```bash
git add src/lib/exhibidora/queries.ts src/lib/exhibidora/queries.test.ts
git commit -m "Remove date-based auto-flip of cartilla changeover"
```

---

### Task 2: `oficializarCambio` manual

**Files:**
- Modify: `src/lib/exhibidora/queries.ts` (agregar función después de `cancelarCambioProgramado`)
- Modify: `src/lib/exhibidora/queries.test.ts` (agregar test)

- [ ] **Step 1: Agregar la función**

En `src/lib/exhibidora/queries.ts`, después de `cancelarCambioProgramado` (antes de `listIdsEnCartillaOProgramados`):

```ts
export async function oficializarCambio(idExhibidora: number): Promise<void> {
  await query(
    `UPDATE malaga.d_exhibidora
     SET id_prod_ant = id_prod, id_prod = id_prod_fut, id_prod_fut = NULL,
         ts_ulticambio = now(), ts_cambio_programado = NULL
     WHERE id_exhibidora = $1 AND id_prod_fut IS NOT NULL`,
    [idExhibidora]
  );
}
```

- [ ] **Step 2: Test**

En `src/lib/exhibidora/queries.test.ts`, agregar el import `oficializarCambio` a la lista existente (línea 4-10) y este test después del de "cancelar un cambio programado":

```ts
  it("oficializarCambio aplica el flip manualmente sin esperar la fecha", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await programarCambio(idExhibidora, p2.idProd, "2099-01-01");
    await oficializarCambio(idExhibidora);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p2.idProd);
    expect(slot.idProdAnt).toBe(p1.idProd);
    expect(slot.idProdFut).toBeNull();
    expect(slot.fechaCambioProgramado).toBeNull();
  });

  it("oficializarCambio no hace nada si no hay cambio programado", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await oficializarCambio(idExhibidora);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p1.idProd);
    expect(slot.idProdAnt).toBeNull();
  });
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true npx vitest run src/lib/exhibidora/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/exhibidora/queries.ts src/lib/exhibidora/queries.test.ts
git commit -m "Add manual oficializarCambio to force a cartilla changeover"
```

---

### Task 3: `exhibirPartida` transaccional con oficialización opcional

**Files:**
- Modify: `src/lib/exhibidora/queries.ts:1,134-145` (imports + función)
- Modify: `src/lib/exhibidora/queries.test.ts` (agregar test)

- [ ] **Step 1: Import de `withTransaction`**

En `src/lib/exhibidora/queries.ts`, línea 1, reemplazar:

```ts
import { query } from "../db";
```

con:

```ts
import { query, withTransaction } from "../db";
```

- [ ] **Step 2: Reescribir `exhibirPartida`**

Reemplazar la función actual:

```ts
export async function exhibirPartida(
  idPartida: number,
  idExhibidora: number,
  userExhibicion: number
): Promise<void> {
  await query(
    `UPDATE malaga.f_partidas_stock
     SET ts_exhibicion = now(), id_exhibidora = $2, user_exhibicion = $3
     WHERE id_partistock = $1`,
    [idPartida, idExhibidora, userExhibicion]
  );
}
```

con:

```ts
export async function exhibirPartida(
  idPartida: number,
  idExhibidora: number,
  userExhibicion: number,
  oficializarCambioAhora = false
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE malaga.f_partidas_stock
       SET ts_exhibicion = now(), id_exhibidora = $2, user_exhibicion = $3
       WHERE id_partistock = $1`,
      [idPartida, idExhibidora, userExhibicion]
    );

    if (oficializarCambioAhora) {
      await client.query(
        `UPDATE malaga.d_exhibidora
         SET id_prod_ant = id_prod, id_prod = id_prod_fut, id_prod_fut = NULL,
             ts_ulticambio = now(), ts_cambio_programado = NULL
         WHERE id_exhibidora = $1 AND id_prod_fut IS NOT NULL`,
        [idExhibidora]
      );
    }
  });
}
```

(El cuarto parámetro tiene default `false`, así que todos los llamadores existentes —incluido el propio módulo Exhibir hasta que se actualice en el Task 6— siguen compilando sin cambios.)

- [ ] **Step 3: Test**

En `src/lib/exhibidora/queries.test.ts`, agregar después del test "exhibir una partida la hace aparecer en stock vigente...":

```ts
  it("exhibirPartida con oficializarCambioAhora aplica el flip de la posición", async () => {
    const userExhibicion = await seedUser();
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01') RETURNING id_exhibidora`,
      [p1.idProd, p2.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;
    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [p1.idProd]
    );

    await exhibirPartida(partida.rows[0].id_partistock, idExhibidora, userExhibicion, true);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p2.idProd);
    expect(slot.idProdAnt).toBe(p1.idProd);
    expect(slot.idProdFut).toBeNull();
  });

  it("exhibirPartida sin oficializarCambioAhora no toca la posición", async () => {
    const userExhibicion = await seedUser();
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01') RETURNING id_exhibidora`,
      [p1.idProd, p2.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;
    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [p1.idProd]
    );

    await exhibirPartida(partida.rows[0].id_partistock, idExhibidora, userExhibicion);

    const slots = await listCartillaActual();
    const slot = slots.find((s) => s.idExhibidora === idExhibidora)!;
    expect(slot.idProd).toBe(p1.idProd);
    expect(slot.idProdFut).toBe(p2.idProd);
  });
```

- [ ] **Step 4: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true npx vitest run src/lib/exhibidora/queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/exhibidora/queries.ts src/lib/exhibidora/queries.test.ts
git commit -m "Make exhibirPartida transactional and support officializing the changeover"
```

---

### Task 4: `listPartidasEnObrador` matchea también por `id_prod_fut`

**Files:**
- Modify: `src/lib/exhibidora/queries.ts:95-132`
- Modify: `src/lib/exhibidora/queries.test.ts`

- [ ] **Step 1: Reescribir la interfaz y la query**

Reemplazar el bloque completo (interfaz + función) actual:

```ts
export interface PartidaEnObrador {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidad: string;
  lote: string;
  fechaFab: string;
  idExhibidoraDestino: number | null;
}

export async function listPartidasEnObrador(): Promise<PartidaEnObrador[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    producto_detalle: string;
    cantidad: string;
    lote: string;
    fecha_fab: string;
    id_exhibidora_destino: number | null;
  }>(
    `SELECT ps.id_partistock, ps.id_prod, p.detalle AS producto_detalle, ps.cantidad, ps.lote,
            ps.fecha_fab::text AS fecha_fab, e.id_exhibidora AS id_exhibidora_destino
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     LEFT JOIN malaga.d_exhibidora e ON e.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL
     ORDER BY ps.fecha_fab, ps.id_partistock`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    cantidad: r.cantidad,
    lote: r.lote,
    fechaFab: r.fecha_fab,
    idExhibidoraDestino: r.id_exhibidora_destino,
  }));
}
```

con:

```ts
export interface PartidaEnObrador {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidad: string;
  lote: string;
  fechaFab: string;
  idExhibidoraDestino: number | null;
  rolEnSlot: "actual" | "entrante" | null;
}

export async function listPartidasEnObrador(): Promise<PartidaEnObrador[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    producto_detalle: string;
    cantidad: string;
    lote: string;
    fecha_fab: string;
    id_exhibidora_destino: number | null;
    rol_en_slot: "actual" | "entrante" | null;
  }>(
    `SELECT ps.id_partistock, ps.id_prod, p.detalle AS producto_detalle, ps.cantidad, ps.lote,
            ps.fecha_fab::text AS fecha_fab,
            COALESCE(e_actual.id_exhibidora, e_fut.id_exhibidora) AS id_exhibidora_destino,
            CASE WHEN e_actual.id_exhibidora IS NOT NULL THEN 'actual'
                 WHEN e_fut.id_exhibidora IS NOT NULL THEN 'entrante'
                 ELSE NULL END AS rol_en_slot
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     LEFT JOIN malaga.d_exhibidora e_actual ON e_actual.id_prod = ps.id_prod
     LEFT JOIN malaga.d_exhibidora e_fut ON e_fut.id_prod_fut = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL
     ORDER BY ps.fecha_fab, ps.id_partistock`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    cantidad: r.cantidad,
    lote: r.lote,
    fechaFab: r.fecha_fab,
    idExhibidoraDestino: r.id_exhibidora_destino,
    rolEnSlot: r.rol_en_slot,
  }));
}
```

- [ ] **Step 2: Test**

En `src/lib/exhibidora/queries.test.ts`, reemplazar el test "listPartidasEnObrador solo muestra partidas PT sin exhibir" por (agrega assertions de `rolEnSlot` sin cambiar el resto):

```ts
  it("listPartidasEnObrador solo muestra partidas PT sin exhibir, con su rol en la posición", async () => {
    const actual = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const entrante = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01')`,
      [actual.idProd, entrante.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1')`,
      [actual.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-02', 'L2')`,
      [entrante.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion)
       VALUES ($1, 4, '2026-08-02', 'L3', now())`,
      [actual.idProd]
    );

    const enObrador = await listPartidasEnObrador();
    expect(enObrador.map((p) => p.lote)).toEqual(["L1", "L2"]);
    expect(enObrador.find((p) => p.lote === "L1")!.rolEnSlot).toBe("actual");
    expect(enObrador.find((p) => p.lote === "L2")!.rolEnSlot).toBe("entrante");
  });
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true npx vitest run src/lib/exhibidora/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/exhibidora/queries.ts src/lib/exhibidora/queries.test.ts
git commit -m "Match batches to a slot by current or incoming flavor"
```

---

### Task 5: PCP considera también `id_prod_fut`

**Files:**
- Modify: `src/lib/pcp/queries.ts:178-186`
- Modify: `src/lib/pcp/queries.test.ts:196-203`

- [ ] **Step 1: Reescribir `getProductosEnCartilla`**

Reemplazar:

```ts
export async function getProductosEnCartilla(): Promise<ProductoEnCartilla[]> {
  const result = await query<{ id_prod: number; detalle: string }>(
    `SELECT DISTINCT p.id_prod, p.detalle
     FROM malaga.d_exhibidora e
     JOIN malaga.d_productos p ON p.id_prod = e.id_prod
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, detalle: r.detalle }));
}
```

con:

```ts
export async function getProductosEnCartilla(): Promise<ProductoEnCartilla[]> {
  const result = await query<{ id_prod: number; detalle: string }>(
    `SELECT DISTINCT p.id_prod, p.detalle
     FROM malaga.d_productos p
     WHERE p.id_prod IN (
       SELECT id_prod FROM malaga.d_exhibidora
       UNION
       SELECT id_prod_fut FROM malaga.d_exhibidora WHERE id_prod_fut IS NOT NULL
     )
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, detalle: r.detalle }));
}
```

- [ ] **Step 2: Test**

En `src/lib/pcp/queries.test.ts`, reemplazar el test `"getProductosEnCartilla devuelve solo los PT actualmente en un slot"`:

```ts
  it("getProductosEnCartilla devuelve solo los PT actualmente en un slot", async () => {
    const enCartilla = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [enCartilla.idProd]);

    const productos = await getProductosEnCartilla();
    expect(productos.map((p) => p.idProd)).toEqual([enCartilla.idProd]);
  });
```

con:

```ts
  it("getProductosEnCartilla devuelve los PT actuales y los programados a futuro", async () => {
    const actual = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const futuro = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01')`,
      [actual.idProd, futuro.idProd]
    );

    const productos = await getProductosEnCartilla();
    expect(productos.map((p) => p.idProd).sort()).toEqual([actual.idProd, futuro.idProd].sort());
  });
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true npx vitest run src/lib/pcp/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/pcp/queries.ts src/lib/pcp/queries.test.ts
git commit -m "PCP plans production for scheduled incoming flavors too"
```

---

### Task 6: Exhibir muestra sabor actual y entrante por separado, con checkbox de última bacha

**Files:**
- Modify: `src/app/(app)/exhibir/actions.ts`
- Modify: `src/app/(app)/exhibir/ExhibirSlot.tsx`
- Modify: `src/app/(app)/exhibir/page.tsx`

- [ ] **Step 1: `actions.ts` acepta el flag de oficialización**

Reemplazar `src/app/(app)/exhibir/actions.ts` entero:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { exhibirPartida } from "@/lib/exhibidora/queries";

export async function exhibirPartidaAction(formData: FormData) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const idExhibidora = Number(formData.get("idExhibidora"));
  const oficializarCambioAhora = formData.get("oficializarCambioAhora") === "on";
  if (!idPartida || !idExhibidora) return;

  await exhibirPartida(idPartida, idExhibidora, user.idUser, oficializarCambioAhora);
  revalidatePath("/exhibir");
  revalidatePath("/planificacion");
  revalidatePath("/stock");
}
```

- [ ] **Step 2: Reescribir `ExhibirSlot.tsx`**

Reemplazar el archivo entero:

```tsx
"use client";

import { useState } from "react";
import { exhibirPartidaAction } from "./actions";
import { formatFecha } from "@/lib/formatDate";
import type { CartillaSlot, PartidaEnObrador } from "@/lib/exhibidora/queries";

function diasDesde(fecha: string): number {
  const ms = Date.now() - new Date(`${fecha}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function BachasDeSabor({
  partidas,
  idExhibidora,
  checkboxUltimaBacha,
}: {
  partidas: PartidaEnObrador[];
  idExhibidora: number;
  checkboxUltimaBacha?: { label: string; hint: boolean };
}) {
  const sorted = [...partidas].sort((a, b) => a.fechaFab.localeCompare(b.fechaFab));
  const masVieja = sorted[0];
  const [selectedId, setSelectedId] = useState(masVieja?.idPartida);
  const [marcarUltima, setMarcarUltima] = useState(false);

  const selected = sorted.find((p) => p.idPartida === selectedId) ?? masVieja;
  const incumpleFifo = !!selected && sorted.length > 1 && selected.idPartida !== masVieja.idPartida;

  if (sorted.length === 0 || !selected) {
    return <p className="text-xs text-ink-soft">Sin bachas pendientes de exhibir.</p>;
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {sorted.map((p) => {
          const esRecomendada = p.idPartida === masVieja.idPartida && sorted.length > 1;
          const seleccionada = p.idPartida === selectedId;
          return (
            <button
              key={p.idPartida}
              type="button"
              onClick={() => setSelectedId(p.idPartida)}
              className={`flex min-w-[108px] flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors ${
                seleccionada
                  ? "border-copper bg-copper-tint"
                  : "border-border bg-surface-raised hover:border-copper/50"
              }`}
            >
              {esRecomendada && (
                <span className="mb-0.5 rounded-full bg-ok-tint px-1.5 py-0.5 text-[9.5px] font-semibold text-ok">
                  Recomendado · FIFO
                </span>
              )}
              <span className="font-mono text-xl font-semibold leading-none text-ink">{p.cantidad}</span>
              <span className="text-xs font-medium text-ink-soft">
                {formatFecha(p.fechaFab)} · hace {diasDesde(p.fechaFab)}d
              </span>
            </button>
          );
        })}
      </div>

      {incumpleFifo && (
        <p className="mb-2.5 rounded-lg bg-warn-tint px-2.5 py-1.5 text-[11px] font-medium text-warn">
          Hay una partida más vieja (del {formatFecha(masVieja.fechaFab)}) todavía sin exhibir. Por FIFO
          conviene sacar esa primero.
        </p>
      )}

      <form action={exhibirPartidaAction} className="flex flex-col gap-2">
        <input type="hidden" name="idPartida" value={selected.idPartida} />
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

        <button
          type="submit"
          className="self-start rounded-lg bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
        >
          {incumpleFifo ? "Exhibir de todos modos" : "Exhibir"}
        </button>
      </form>
    </>
  );
}

export function ExhibirSlot({
  slot,
  partidasActuales,
  partidasEntrantes,
}: {
  slot: CartillaSlot;
  partidasActuales: PartidaEnObrador[];
  partidasEntrantes: PartidaEnObrador[];
}) {
  return (
    <div className="card flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-copper-tint font-mono text-[11px] font-semibold text-copper-strong">
          {slot.nro}
        </span>
        <h3 className="text-sm font-semibold text-ink">{slot.productoDetalle}</h3>
      </div>

      <BachasDeSabor
        partidas={partidasActuales}
        idExhibidora={slot.idExhibidora}
        checkboxUltimaBacha={
          slot.idProdFut
            ? {
                label: `Marcar como última bacha antes del cambio a ${slot.productoFutDetalle}`,
                hint: partidasActuales.length <= 1,
              }
            : undefined
        }
      />

      {slot.idProdFut && partidasEntrantes.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-warn">Entrante: {slot.productoFutDetalle}</p>
          <BachasDeSabor partidas={partidasEntrantes} idExhibidora={slot.idExhibidora} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx` separa bachas actuales de entrantes**

Reemplazar `src/app/(app)/exhibir/page.tsx` entero:

```tsx
import {
  listCartillaActual,
  listPartidasEnObrador,
  type PartidaEnObrador,
} from "@/lib/exhibidora/queries";
import { ExhibirSlot } from "./ExhibirSlot";
import { ExhibirGroup } from "./ExhibirGroup";

export default async function ExhibirPage() {
  const [slots, partidas] = await Promise.all([listCartillaActual(), listPartidasEnObrador()]);

  const actualesPorSlot = new Map<number, PartidaEnObrador[]>();
  const entrantesPorSlot = new Map<number, PartidaEnObrador[]>();
  const sinAsignar: PartidaEnObrador[] = [];
  for (const p of partidas) {
    if (p.idExhibidoraDestino && p.rolEnSlot === "actual") {
      const arr = actualesPorSlot.get(p.idExhibidoraDestino) ?? [];
      arr.push(p);
      actualesPorSlot.set(p.idExhibidoraDestino, arr);
    } else if (p.idExhibidoraDestino && p.rolEnSlot === "entrante") {
      const arr = entrantesPorSlot.get(p.idExhibidoraDestino) ?? [];
      arr.push(p);
      entrantesPorSlot.set(p.idExhibidoraDestino, arr);
    } else {
      sinAsignar.push(p);
    }
  }

  const gruposSinAsignar = new Map<number, { productoDetalle: string; partidas: PartidaEnObrador[] }>();
  for (const p of sinAsignar) {
    if (!gruposSinAsignar.has(p.idProd)) {
      gruposSinAsignar.set(p.idProd, { productoDetalle: p.productoDetalle, partidas: [] });
    }
    gruposSinAsignar.get(p.idProd)!.partidas.push(p);
  }
  const gruposSinAsignarOrdenados = [...gruposSinAsignar.values()].sort((a, b) =>
    a.productoDetalle.localeCompare(b.productoDetalle)
  );

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <p className="page-eyebrow mb-1">Vitrina</p>
      <h1 className="mb-1 text-xl font-semibold text-ink">Exhibir bachas</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Todas las posiciones de la exhibidora, tengan o no bachas esperando. Producto y fecha de fabricación
        son lo primero que se mira en el obrador — por eso van grandes. Si hay más de una partida del mismo
        sabor, se recomienda siempre la más vieja primero.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {slots.map((slot) => (
          <ExhibirSlot
            key={slot.idExhibidora}
            slot={slot}
            partidasActuales={actualesPorSlot.get(slot.idExhibidora) ?? []}
            partidasEntrantes={entrantesPorSlot.get(slot.idExhibidora) ?? []}
          />
        ))}
      </div>

      {gruposSinAsignarOrdenados.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-warn">
            Bachas sin posición asignada — el sabor no coincide con ninguna posición actual ni programada de
            la cartilla
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {gruposSinAsignarOrdenados.map((g) => (
              <ExhibirGroup key={g.productoDetalle} productoDetalle={g.productoDetalle} partidas={g.partidas} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

`ExhibirGroup.tsx` no cambia — sigue usándose tal cual para el fallback de "sin posición asignada".

- [ ] **Step 4: Type-check y lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: sin errores.

- [ ] **Step 5: Verificación manual en navegador**

Usando `preview_start` (config `malaga-soft` de `.claude/launch.json`) y una cuenta de prueba (crear con `npm run create-user`, borrar al terminar junto a su fila en `sesiones`):

1. En Cartilla actual, programar un cambio para una posición con fecha de hoy.
2. Fabricar y finalizar una OP del sabor entrante (o insertar una partida sin exhibir directamente).
3. Ir a Exhibir: confirmar que la posición muestra el sabor actual (con su checkbox de "última bacha") y, debajo, el bloque "Entrante: [sabor]" con la bacha nueva exhibible.
4. Exhibir la bacha entrante sin tildar nada raro — confirmar que no cambia `id_prod` de la posición (revisar en Cartilla actual).
5. Exhibir la última bacha del sabor actual tildando el checkbox — confirmar que Cartilla actual ahora muestra el sabor entrante como actual y el saliente como "Antes: [sabor]".

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/exhibir/
git commit -m "Show outgoing and incoming flavor separately in Exhibir, with last-batch checkbox"
```

---

### Task 7: Botón manual "Oficializar cambio ahora" en Cartilla actual

**Files:**
- Modify: `src/app/(app)/planificacion/actions.ts`
- Modify: `src/app/(app)/planificacion/CartillaGrid.tsx`

- [ ] **Step 1: Agregar la action**

En `src/app/(app)/planificacion/actions.ts`, agregar el import y la función:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { programarCambio, cancelarCambioProgramado, oficializarCambio } from "@/lib/exhibidora/queries";

export async function programarCambioAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  const idProdNuevo = Number(formData.get("idProdNuevo"));
  const fechaProgramada = String(formData.get("fechaProgramada") ?? "");
  if (!idExhibidora || !idProdNuevo || !fechaProgramada) return;

  await programarCambio(idExhibidora, idProdNuevo, fechaProgramada);
  revalidatePath("/planificacion");
}

export async function cancelarCambioProgramadoAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  if (!idExhibidora) return;

  await cancelarCambioProgramado(idExhibidora);
  revalidatePath("/planificacion");
}

export async function oficializarCambioAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  if (!idExhibidora) return;

  await oficializarCambio(idExhibidora);
  revalidatePath("/planificacion");
  revalidatePath("/exhibir");
}
```

- [ ] **Step 2: Actualizar `CartillaGrid.tsx`**

En `src/app/(app)/planificacion/CartillaGrid.tsx`, reemplazar el import de actions:

```ts
import { programarCambioAction, cancelarCambioProgramadoAction } from "./actions";
```

con:

```ts
import { programarCambioAction, cancelarCambioProgramadoAction, oficializarCambioAction } from "./actions";
```

Y reemplazar el bloque del cambio programado:

```tsx
            {abierto.idProdFut && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-warn-tint p-3 text-xs text-warn">
                <span>
                  Cambia a <span className="font-semibold">{abierto.productoFutDetalle}</span> el{" "}
                  {formatFecha(abierto.fechaCambioProgramado)}
                </span>
                <form action={cancelarCambioProgramadoAction}>
                  <input type="hidden" name="idExhibidora" value={abierto.idExhibidora} />
                  <button type="submit" className="font-semibold underline hover:no-underline">
                    Cancelar
                  </button>
                </form>
              </div>
            )}
```

con:

```tsx
            {abierto.idProdFut && (
              <div className="mb-4 flex flex-col gap-2 rounded-lg bg-warn-tint p-3 text-xs text-warn">
                <span>
                  Previsto: cambia a <span className="font-semibold">{abierto.productoFutDetalle}</span> (~
                  {formatFecha(abierto.fechaCambioProgramado)}) — se oficializa al exhibir la última bacha del
                  actual, o manualmente acá.
                </span>
                <div className="flex items-center gap-3">
                  <form action={oficializarCambioAction}>
                    <input type="hidden" name="idExhibidora" value={abierto.idExhibidora} />
                    <button type="submit" className="font-semibold underline hover:no-underline">
                      Oficializar cambio ahora
                    </button>
                  </form>
                  <form action={cancelarCambioProgramadoAction}>
                    <input type="hidden" name="idExhibidora" value={abierto.idExhibidora} />
                    <button type="submit" className="font-semibold underline hover:no-underline">
                      Cancelar
                    </button>
                  </form>
                </div>
              </div>
            )}
```

Y ajustar la etiqueta del campo de fecha (ya no es "cambio inmediato"):

```tsx
              <label className="flex flex-col gap-1 text-xs text-ink">
                Fecha (hoy = cambio inmediato)
                <input
```

por:

```tsx
              <label className="flex flex-col gap-1 text-xs text-ink">
                Fecha prevista (orientativa — el cambio se oficializa al exhibir la última bacha)
                <input
```

- [ ] **Step 3: Type-check y lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

En Cartilla actual, programar un cambio y usar "Oficializar cambio ahora" — confirmar que el flip ocurre y el modal refleja el nuevo sabor actual/anterior.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/planificacion/
git commit -m "Add manual override to officialize a cartilla changeover from Cartilla actual"
```

---

### Task 8: Verificación completa Fase A

- [ ] **Step 1: Suite completa**

Run: `npm test` (esperado: todo bloqueado por el guard de `RUN_DESTRUCTIVE_DB_TESTS`, es lo esperado) y `npm run test:db`.
Expected: PASS en todos los archivos.

- [ ] **Step 2: Restaurar datos reales**

`npm run test:db` trunca tablas reales compartidas. Restaurar con:

```bash
NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx tsx --env-file=.env scripts/import-historico.ts
NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx tsx --env-file=.env scripts/import-recetas.ts
```

(`import-historico.ts` primero, siempre.) Verificar conteos: 53 productos, 24 slots de cartilla, 36 recetas, 7862 partidas.

- [ ] **Step 3: Walkthrough manual end-to-end**

Con una cuenta de prueba (crear y borrar al final, igual que en tareas anteriores): programar un cambio real en Cartilla actual, confirmar que PCP (`/pcp?tab=estadisticas` o el plan de mañana) ya considera el sabor entrante, exhibir bachas de ambos sabores en Exhibir, oficializar el cambio desde el checkbox, confirmar en Cartilla actual que quedó reflejado.

- [ ] **Step 4: Commit final de la fase (si hubo algún ajuste)**

```bash
git add -A
git commit -m "Fase A (cambio de carta) verificada end-to-end"
```

Si no hubo cambios de código durante la verificación, no hace falta este commit.

---

## Fase B — Módulo de Quiebres

### Task 9: Migración `f_quiebres`

**Files:**
- Create: `migrations/<timestamp>_create-f-quiebres.js`

- [ ] **Step 1: Generar el archivo**

Run: `npm run migrate:create -- create-f-quiebres`

Esto crea un archivo `migrations/<timestamp>_create-f-quiebres.js` con el scaffold ESM por defecto — reemplazarlo entero (siguiendo la convención CommonJS ya usada en todas las migraciones de este proyecto) con:

```js
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_quiebres (
      id_quiebre SERIAL PRIMARY KEY,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      ts_carga TIMESTAMPTZ NOT NULL DEFAULT now(),
      ts_quiebre_real TIMESTAMPTZ NOT NULL,
      user_carga INTEGER NOT NULL REFERENCES malaga.usuarios(id_user),
      ts_repuesto TIMESTAMPTZ,
      id_partida_repuso INTEGER REFERENCES malaga.f_partidas_stock(id_partistock)
    );

    CREATE INDEX idx_quiebres_id_prod ON malaga.f_quiebres(id_prod);
    CREATE INDEX idx_quiebres_abiertos ON malaga.f_quiebres(id_prod) WHERE ts_repuesto IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_quiebres;`);
};
```

(El índice `idx_quiebres_abiertos` es un índice parcial normal, no `UNIQUE` — el spec pidió explícitamente no forzar unicidad a nivel de base de datos; el bloqueo de duplicados se hace en `crearQuiebre`, Task 10. El índice solo acelera la búsqueda de quiebres abiertos.)

- [ ] **Step 2: Correr la migración**

Run: `npm run migrate:up`
Expected: sale "f_quiebres" en el log de migraciones aplicadas, sin errores.

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "Add f_quiebres table"
```

---

### Task 10: `src/lib/quiebres/queries.ts` — elegibilidad y carga

**Files:**
- Create: `src/lib/quiebres/queries.ts`
- Create: `src/lib/quiebres/queries.test.ts`

- [ ] **Step 1: Escribir el módulo**

```ts
import { query } from "../db";

export interface SaborParaQuiebre {
  idProd: number;
  detalle: string;
  tieneBachasPendientes: boolean;
}

export async function listSaboresParaQuiebre(): Promise<SaborParaQuiebre[]> {
  const result = await query<{ id_prod: number; detalle: string; tiene_bachas_pendientes: boolean }>(
    `SELECT p.id_prod, p.detalle,
            EXISTS (
              SELECT 1 FROM malaga.f_partidas_stock ps
              WHERE ps.id_prod = p.id_prod AND ps.ts_exhibicion IS NULL
            ) AS tiene_bachas_pendientes
     FROM malaga.d_productos p
     WHERE p.tipo_producto = 'PT' AND p.activo = true
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    tieneBachasPendientes: r.tiene_bachas_pendientes,
  }));
}

export interface QuiebreAbierto {
  idQuiebre: number;
  idProd: number;
  productoDetalle: string;
  tsCarga: string;
  tsQuiebreReal: string;
  userCarga: string | null;
}

function mapQuiebreAbierto(row: {
  id_quiebre: number;
  id_prod: number;
  producto_detalle: string;
  ts_carga: string;
  ts_quiebre_real: string;
  user_carga: string | null;
}): QuiebreAbierto {
  return {
    idQuiebre: row.id_quiebre,
    idProd: row.id_prod,
    productoDetalle: row.producto_detalle,
    tsCarga: row.ts_carga,
    tsQuiebreReal: row.ts_quiebre_real,
    userCarga: row.user_carga,
  };
}

export async function getQuiebreAbiertoPorProducto(idProd: number): Promise<QuiebreAbierto | null> {
  const result = await query<{
    id_quiebre: number;
    id_prod: number;
    producto_detalle: string;
    ts_carga: string;
    ts_quiebre_real: string;
    user_carga: string | null;
  }>(
    `SELECT q.id_quiebre, q.id_prod, p.detalle AS producto_detalle,
            q.ts_carga::text AS ts_carga, q.ts_quiebre_real::text AS ts_quiebre_real,
            u.email AS user_carga
     FROM malaga.f_quiebres q
     JOIN malaga.d_productos p ON p.id_prod = q.id_prod
     LEFT JOIN malaga.usuarios u ON u.id_user = q.user_carga
     WHERE q.id_prod = $1 AND q.ts_repuesto IS NULL`,
    [idProd]
  );
  const row = result.rows[0];
  return row ? mapQuiebreAbierto(row) : null;
}

export async function crearQuiebre(
  idProd: number,
  tsQuiebreReal: string,
  userCarga: number
): Promise<{ idQuiebre: number }> {
  const existente = await getQuiebreAbiertoPorProducto(idProd);
  if (existente) {
    throw new Error("Ya hay un quiebre abierto para este sabor.");
  }

  const result = await query<{ id_quiebre: number }>(
    `INSERT INTO malaga.f_quiebres (id_prod, ts_quiebre_real, user_carga)
     VALUES ($1, $2, $3) RETURNING id_quiebre`,
    [idProd, tsQuiebreReal, userCarga]
  );
  return { idQuiebre: result.rows[0].id_quiebre };
}
```

- [ ] **Step 2: Tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { listSaboresParaQuiebre, getQuiebreAbiertoPorProducto, crearQuiebre } from "./queries";

describe("quiebres queries", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_quiebres, malaga.f_partidas_stock, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("listSaboresParaQuiebre marca cuáles tienen bachas pendientes de exhibir", async () => {
    const sinStock = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const conStock = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 4, '2026-08-01', 'L1')`,
      [conStock.idProd]
    );

    const sabores = await listSaboresParaQuiebre();
    expect(sabores.find((s) => s.idProd === sinStock.idProd)!.tieneBachasPendientes).toBe(false);
    expect(sabores.find((s) => s.idProd === conStock.idProd)!.tieneBachasPendientes).toBe(true);
  });

  it("crearQuiebre inserta y getQuiebreAbiertoPorProducto lo encuentra", async () => {
    const userCarga = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });

    await crearQuiebre(producto.idProd, "2026-08-01T10:00:00Z", userCarga);

    const abierto = await getQuiebreAbiertoPorProducto(producto.idProd);
    expect(abierto).not.toBeNull();
    expect(abierto!.productoDetalle).toBe("Vainilla");
    expect(abierto!.userCarga).toBe("t@t.com");
  });

  it("crearQuiebre bloquea un segundo quiebre abierto para el mismo sabor", async () => {
    const userCarga = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });

    await crearQuiebre(producto.idProd, "2026-08-01T10:00:00Z", userCarga);

    await expect(crearQuiebre(producto.idProd, "2026-08-01T12:00:00Z", userCarga)).rejects.toThrow(
      "Ya hay un quiebre abierto para este sabor."
    );
  });
});
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true npx vitest run src/lib/quiebres/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/quiebres/
git commit -m "Add quiebres eligibility and creation queries"
```

---

### Task 11: Listas de quiebres abiertos y resueltos

**Files:**
- Modify: `src/lib/quiebres/queries.ts` (agregar funciones)
- Modify: `src/lib/quiebres/queries.test.ts` (agregar tests)

- [ ] **Step 1: Agregar `listQuiebresAbiertos` y `listQuiebresResueltos`**

Al final de `src/lib/quiebres/queries.ts`, agregar:

```ts
export async function listQuiebresAbiertos(): Promise<QuiebreAbierto[]> {
  const result = await query<{
    id_quiebre: number;
    id_prod: number;
    producto_detalle: string;
    ts_carga: string;
    ts_quiebre_real: string;
    user_carga: string | null;
  }>(
    `SELECT q.id_quiebre, q.id_prod, p.detalle AS producto_detalle,
            q.ts_carga::text AS ts_carga, q.ts_quiebre_real::text AS ts_quiebre_real,
            u.email AS user_carga
     FROM malaga.f_quiebres q
     JOIN malaga.d_productos p ON p.id_prod = q.id_prod
     LEFT JOIN malaga.usuarios u ON u.id_user = q.user_carga
     WHERE q.ts_repuesto IS NULL
     ORDER BY q.ts_quiebre_real`
  );
  return result.rows.map(mapQuiebreAbierto);
}

export interface QuiebreResuelto {
  idQuiebre: number;
  productoDetalle: string;
  tsQuiebreReal: string;
  tsRepuesto: string;
  minutosResolucion: number;
}

export async function listQuiebresResueltos(limite = 30): Promise<QuiebreResuelto[]> {
  const result = await query<{
    id_quiebre: number;
    producto_detalle: string;
    ts_quiebre_real: string;
    ts_repuesto: string;
    minutos_resolucion: string;
  }>(
    `SELECT q.id_quiebre, p.detalle AS producto_detalle,
            q.ts_quiebre_real::text AS ts_quiebre_real, q.ts_repuesto::text AS ts_repuesto,
            EXTRACT(EPOCH FROM (q.ts_repuesto - q.ts_quiebre_real)) / 60 AS minutos_resolucion
     FROM malaga.f_quiebres q
     JOIN malaga.d_productos p ON p.id_prod = q.id_prod
     WHERE q.ts_repuesto IS NOT NULL
     ORDER BY q.ts_repuesto DESC
     LIMIT $1`,
    [limite]
  );
  return result.rows.map((r) => ({
    idQuiebre: r.id_quiebre,
    productoDetalle: r.producto_detalle,
    tsQuiebreReal: r.ts_quiebre_real,
    tsRepuesto: r.ts_repuesto,
    minutosResolucion: Math.round(Number(r.minutos_resolucion)),
  }));
}
```

- [ ] **Step 2: Tests**

Agregar a `src/lib/quiebres/queries.test.ts`, importando también `listQuiebresAbiertos` y `listQuiebresResueltos` en el `import` existente:

```ts
  it("listQuiebresAbiertos devuelve solo los no resueltos, ordenados por antigüedad", async () => {
    const userCarga = await seedUser();
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await crearQuiebre(p1.idProd, "2026-08-01T12:00:00Z", userCarga);
    await crearQuiebre(p2.idProd, "2026-08-01T09:00:00Z", userCarga);

    const abiertos = await listQuiebresAbiertos();
    expect(abiertos.map((q) => q.productoDetalle)).toEqual(["Chocolate", "Vainilla"]);
  });

  it("listQuiebresResueltos calcula los minutos entre ts_quiebre_real y ts_repuesto", async () => {
    const userCarga = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const { idQuiebre } = await crearQuiebre(producto.idProd, "2026-08-01T10:00:00Z", userCarga);
    await query(
      `UPDATE malaga.f_quiebres SET ts_repuesto = '2026-08-01T11:30:00Z' WHERE id_quiebre = $1`,
      [idQuiebre]
    );

    const resueltos = await listQuiebresResueltos();
    expect(resueltos).toHaveLength(1);
    expect(resueltos[0].minutosResolucion).toBe(90);
  });
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true npx vitest run src/lib/quiebres/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/quiebres/
git commit -m "Add open and resolved quiebres listings"
```

---

### Task 12: Reposición automática dentro de `exhibirPartida`

**Files:**
- Modify: `src/lib/exhibidora/queries.ts`
- Modify: `src/lib/exhibidora/queries.test.ts`

- [ ] **Step 1: Reescribir `exhibirPartida` para cerrar el quiebre abierto**

Reemplazar la función escrita en el Task 3:

```ts
export async function exhibirPartida(
  idPartida: number,
  idExhibidora: number,
  userExhibicion: number,
  oficializarCambioAhora = false
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE malaga.f_partidas_stock
       SET ts_exhibicion = now(), id_exhibidora = $2, user_exhibicion = $3
       WHERE id_partistock = $1`,
      [idPartida, idExhibidora, userExhibicion]
    );

    if (oficializarCambioAhora) {
      await client.query(
        `UPDATE malaga.d_exhibidora
         SET id_prod_ant = id_prod, id_prod = id_prod_fut, id_prod_fut = NULL,
             ts_ulticambio = now(), ts_cambio_programado = NULL
         WHERE id_exhibidora = $1 AND id_prod_fut IS NOT NULL`,
        [idExhibidora]
      );
    }
  });
}
```

con:

```ts
export async function exhibirPartida(
  idPartida: number,
  idExhibidora: number,
  userExhibicion: number,
  oficializarCambioAhora = false
): Promise<void> {
  await withTransaction(async (client) => {
    const partidaResult = await client.query<{ id_prod: number }>(
      `UPDATE malaga.f_partidas_stock
       SET ts_exhibicion = now(), id_exhibidora = $2, user_exhibicion = $3
       WHERE id_partistock = $1
       RETURNING id_prod`,
      [idPartida, idExhibidora, userExhibicion]
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

    await client.query(
      `UPDATE malaga.f_quiebres
       SET ts_repuesto = now(), id_partida_repuso = $2
       WHERE id_prod = $1 AND ts_repuesto IS NULL`,
      [idProd, idPartida]
    );
  });
}
```

- [ ] **Step 2: Test**

En `src/lib/exhibidora/queries.test.ts`, agregar al `beforeEach` la tabla `f_quiebres` a la lista de `TRUNCATE` (línea 14-16):

```ts
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_quiebres, malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });
```

Y agregar, después del test "exhibirPartida sin oficializarCambioAhora no toca la posición":

```ts
  it("exhibirPartida cierra un quiebre abierto del mismo producto", async () => {
    const userExhibicion = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [producto.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;
    const quiebre = await query<{ id_quiebre: number }>(
      `INSERT INTO malaga.f_quiebres (id_prod, ts_quiebre_real, user_carga)
       VALUES ($1, '2026-08-01T10:00:00Z', $2) RETURNING id_quiebre`,
      [producto.idProd, userExhibicion]
    );
    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [producto.idProd]
    );

    await exhibirPartida(partida.rows[0].id_partistock, idExhibidora, userExhibicion);

    const cerrado = await query<{ ts_repuesto: string | null; id_partida_repuso: number | null }>(
      `SELECT ts_repuesto, id_partida_repuso FROM malaga.f_quiebres WHERE id_quiebre = $1`,
      [quiebre.rows[0].id_quiebre]
    );
    expect(cerrado.rows[0].ts_repuesto).not.toBeNull();
    expect(cerrado.rows[0].id_partida_repuso).toBe(partida.rows[0].id_partistock);
  });

  it("exhibirPartida no hace nada si no hay quiebre abierto para el producto", async () => {
    const userExhibicion = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [producto.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;
    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [producto.idProd]
    );

    await exhibirPartida(partida.rows[0].id_partistock, idExhibidora, userExhibicion);

    const count = await query<{ count: string }>(`SELECT count(*) FROM malaga.f_quiebres`);
    expect(Number(count.rows[0].count)).toBe(0);
  });
```

- [ ] **Step 3: Correr los tests**

Run: `RUN_DESTRUCTIVE_DB_TESTS=true npx vitest run src/lib/exhibidora/queries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/exhibidora/queries.ts src/lib/exhibidora/queries.test.ts
git commit -m "Auto-close a matching open quiebre when exhibiting a batch"
```

---

### Task 13: Ícono y navegación

**Files:**
- Modify: `src/components/icons.tsx`
- Modify: `src/app/(app)/navItems.ts`

- [ ] **Step 1: Agregar `IconAlert`**

Al final de `src/components/icons.tsx`, después de `IconUser`:

```tsx
export function IconAlert(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 4 21 19H3L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 2: Agregar la entrada de navegación**

En `src/app/(app)/navItems.ts`, agregar `IconAlert` al import y una entrada nueva después de "Exhibir":

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
} from "@/components/icons";

export const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: IconHome },
  { href: "/planificacion", label: "Cartilla actual", icon: IconTarget },
  { href: "/pcp", label: "PCP", icon: IconTrendUp },
  { href: "/exhibir", label: "Exhibir", icon: IconStorefront },
  { href: "/quiebres", label: "Quiebres", icon: IconAlert },
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
git commit -m "Add Quiebres icon and nav entry"
```

---

### Task 14: Server action para cargar un quiebre

**Files:**
- Create: `src/app/(app)/quiebres/actions.ts`

- [ ] **Step 1: Escribir la action**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { crearQuiebre } from "@/lib/quiebres/queries";

export async function crearQuiebreAction(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idProd = Number(formData.get("idProd"));
  const tsQuiebreReal = String(formData.get("tsQuiebreReal") ?? "");

  if (!idProd || !tsQuiebreReal) {
    return { error: "Elegí un sabor y la fecha/hora real del quiebre." };
  }

  try {
    await crearQuiebre(idProd, tsQuiebreReal, user.idUser);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo cargar el quiebre." };
  }

  revalidatePath("/quiebres");
  return { success: true };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores (el archivo compila aunque todavía no lo use ninguna página, hasta el Task 15).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/quiebres/actions.ts
git commit -m "Add crearQuiebreAction server action"
```

---

### Task 15: Pantalla `/quiebres`

**Files:**
- Create: `src/app/(app)/quiebres/QuiebreForm.tsx`
- Create: `src/app/(app)/quiebres/page.tsx`

- [ ] **Step 1: `QuiebreForm.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { crearQuiebreAction } from "./actions";
import type { SaborParaQuiebre } from "@/lib/quiebres/queries";

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QuiebreForm({ sabores }: { sabores: SaborParaQuiebre[] }) {
  const [state, formAction, pending] = useActionState(crearQuiebreAction, undefined);
  const [idProd, setIdProd] = useState("");
  const [tsLocal, setTsLocal] = useState(nowLocal());

  const seleccionado = sabores.find((s) => String(s.idProd) === idProd);
  const tieneStockEsperando = !!seleccionado?.tieneBachasPendientes;

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="tsQuiebreReal" value={tsLocal ? new Date(tsLocal).toISOString() : ""} />

      <label className="flex flex-col gap-1 text-sm text-ink">
        Sabor
        <select
          name="idProd"
          required
          value={idProd}
          onChange={(e) => setIdProd(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <option value="">Elegí un sabor...</option>
          {sabores.map((s) => (
            <option key={s.idProd} value={s.idProd}>
              {s.detalle}
              {s.tieneBachasPendientes ? " (tiene bachas esperando)" : ""}
            </option>
          ))}
        </select>
      </label>

      {tieneStockEsperando && (
        <p className="rounded-lg bg-warn-tint px-3 py-2 text-xs font-medium text-warn">
          Este sabor todavía tiene bachas esperando para exhibir. ¿Seguro que es un quiebre?
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-ink">
        Fecha y hora real del quiebre
        <input
          type="datetime-local"
          required
          value={tsLocal}
          onChange={(e) => setTsLocal(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        />
      </label>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.success && <p className="text-sm text-ok">Quiebre registrado.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Registrar quiebre"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: `page.tsx`**

```tsx
import { requireRole } from "@/lib/auth/requireRole";
import { listSaboresParaQuiebre, listQuiebresAbiertos, listQuiebresResueltos } from "@/lib/quiebres/queries";
import { formatFechaHora } from "@/lib/formatDate";
import { IconAlert } from "@/components/icons";
import { QuiebreForm } from "./QuiebreForm";

export default async function QuiebresPage() {
  await requireRole(["gestion", "admin", "produccion"]);

  const [sabores, abiertos, resueltos] = await Promise.all([
    listSaboresParaQuiebre(),
    listQuiebresAbiertos(),
    listQuiebresResueltos(),
  ]);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bad-tint text-bad">
          <IconAlert className="h-4 w-4" />
        </span>
        <div>
          <p className="page-eyebrow leading-none">Vitrina</p>
          <h1 className="text-xl font-semibold text-ink">Quiebres</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Cargar quiebre</h2>
          <QuiebreForm sabores={sabores} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Quiebres abiertos</h2>
          <div className="flex flex-col gap-2">
            {abiertos.map((q) => (
              <div key={q.idQuiebre} className="card p-3">
                <div className="text-sm font-medium text-ink">{q.productoDetalle}</div>
                <div className="font-mono text-[10.5px] text-ink-soft">
                  Desde {formatFechaHora(q.tsQuiebreReal)}
                  {q.userCarga ? ` · cargado por ${q.userCarga}` : ""}
                </div>
              </div>
            ))}
            {abiertos.length === 0 && (
              <p className="card py-6 text-center text-sm text-ink-soft">No hay quiebres abiertos.</p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Historial de resueltos</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3.5 py-2.5">Sabor</th>
                <th className="px-3.5 py-2.5">Desde</th>
                <th className="px-3.5 py-2.5">Repuesto</th>
                <th className="px-3.5 py-2.5 text-right">Tardó</th>
              </tr>
            </thead>
            <tbody>
              {resueltos.map((q) => (
                <tr
                  key={q.idQuiebre}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-3.5 py-2.5 font-medium text-ink">{q.productoDetalle}</td>
                  <td className="px-3.5 py-2.5 text-ink-soft">{formatFechaHora(q.tsQuiebreReal)}</td>
                  <td className="px-3.5 py-2.5 text-ink-soft">{formatFechaHora(q.tsRepuesto)}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">
                    {q.minutosResolucion < 60
                      ? `${q.minutosResolucion} min`
                      : `${(q.minutosResolucion / 60).toFixed(1)} h`}
                  </td>
                </tr>
              ))}
              {resueltos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3.5 py-6 text-center text-ink-soft">
                    Todavía no se resolvió ningún quiebre.
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

- [ ] **Step 3: Type-check y lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Con una cuenta de prueba: cargar un quiebre de un sabor sin bachas pendientes (sin advertencia), intentar cargar el mismo sabor de nuevo (debe bloquear y mostrar el error), cargar un sabor con bachas pendientes (debe mostrar la advertencia pero permitir guardar). Exhibir una bacha de un sabor con quiebre abierto y confirmar que aparece en "Historial de resueltos" con el tiempo calculado.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/quiebres/
git commit -m "Add /quiebres screen: form, open list, resolved history"
```

---

### Task 16: Verificación completa Fase B

- [ ] **Step 1: Suite completa**

Run: `npm test` y `npm run test:db`.
Expected: PASS en todos los archivos.

- [ ] **Step 2: Restaurar datos reales**

Mismo procedimiento que el Task 8 (Fase A):

```bash
NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx tsx --env-file=.env scripts/import-historico.ts
NODE_EXTRA_CA_CERTS=./certs/server-ca.pem npx tsx --env-file=.env scripts/import-recetas.ts
```

Verificar conteos: 53 productos, 24 slots de cartilla, 36 recetas, 7862 partidas.

- [ ] **Step 3: Walkthrough manual end-to-end**

Con una cuenta de prueba (crear y borrar al final): ciclo completo — cargar un quiebre real de un sabor sin stock, confirmar que aparece en "Quiebres abiertos", exhibir una bacha nueva de ese sabor desde Exhibir, confirmar que el quiebre pasa a "Historial de resueltos" con un tiempo de resolución sensato, e intentar cargar un duplicado en algún punto intermedio para confirmar el bloqueo.

- [ ] **Step 4: Commit final de la fase (si hubo algún ajuste)**

```bash
git add -A
git commit -m "Fase B (quiebres) verificada end-to-end"
```

Si no hubo cambios de código durante la verificación, no hace falta este commit.

---

## Self-review notes

- **Cobertura del spec de cambio de carta:** eliminación del auto-flip → Task 1. Oficialización manual (checkbox + botón) → Tasks 2, 3, 6, 7. Exhibir con saliente/entrante separados → Task 6. PCP considerando `id_prod_fut` → Task 5. Ajuste de texto en Cartilla actual → Task 7.
- **Cobertura del spec de quiebres:** tabla y elegibilidad → Tasks 9, 10. Bloqueo de duplicado → Task 10. Reposición automática enganchada en `exhibirPartida` → Task 12 (construye sobre la transacción ya armada en el Task 3). Vistas de abiertos/resueltos → Tasks 11, 15. Advertencia no bloqueante por stock esperando → Task 15.
- **Consistencia de tipos:** `PartidaEnObrador.rolEnSlot` (Task 4) se usa igual en `ExhibirSlot`/`page.tsx` (Task 6). `exhibirPartida`'s cuarto parámetro `oficializarCambioAhora` (Task 3) se mantiene con el mismo nombre en `actions.ts` (Task 6) y en la reescritura del Task 12. `SaborParaQuiebre`/`QuiebreAbierto`/`QuiebreResuelto` (Tasks 10-11) se usan sin cambios en `QuiebreForm`/`page.tsx` (Task 15).
- **Sin placeholders:** cada paso trae el código completo a escribir, no hay "agregar validación" ni "similar al Task N" sin contenido.
- **Orden de dependencia entre fases:** el Task 3 (transacción en `exhibirPartida`) es prerequisito tanto del Task 6 (checkbox) como del Task 12 (cierre de quiebre) — por eso Fase A va primero aunque Quiebres podría en teoría desarrollarse en paralelo; se prefirió el orden secuencial para no tener dos ramas de trabajo tocando la misma función a la vez.

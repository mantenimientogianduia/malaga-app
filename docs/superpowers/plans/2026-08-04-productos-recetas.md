# Malaga Soft — Fase 3: Productos y Recetas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alta y listado de productos (PT/SEMI), y alta de recetas multinivel versionadas (una nueva versión desactiva automáticamente la anterior), con una UI navegable (sidebar) en vez de páginas sueltas.

**Architecture:** Módulos de acceso a datos puros (`src/lib/productos`, `src/lib/recetas`) con la lógica de negocio y sus tests — versionado de recetas, validación de `peso_estandar` obligatorio para PT, y auto-desactivación de la versión anterior al crear una nueva, todo en una transacción. Las páginas son Server Components que llaman a esos módulos directamente (sin API REST intermedia — es un monolito Next.js, no hace falta). Las mutaciones son Server Actions con gate de rol (`gestion`/`admin`; `produccion` solo puede ver). A partir de esta fase hay más de una página, así que se introduce un layout de shell con navegación lateral (route group `(app)`), separado del layout standalone de `/login`.

**Tech Stack:** el mismo de las fases anteriores (Next.js App Router, Server Actions, `pg`, Vitest). Sin librerías nuevas.

---

### Task 1: Helpers de autorización por rol

**Files:**
- Create: `src/lib/auth/requireRole.ts`

- [ ] **Step 1: Implementar**

```typescript
// src/lib/auth/requireRole.ts
import { redirect } from "next/navigation";
import { getCurrentUser } from "./currentUser";
import type { SessionUser } from "./session";

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: SessionUser["rol"][]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.rol)) {
    redirect("/");
  }
  return user;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth/requireRole.ts
git commit -m "feat: add requireUser/requireRole authorization helpers"
```

---

### Task 2: Shell de la app con navegación lateral

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/(app)/page.tsx`

`(app)` es un route group: no agrega segmento a la URL, solo agrupa qué páginas comparten este layout. `/login` queda afuera del grupo, con su propio layout centrado (sin sidebar).

- [ ] **Step 1: Crear el layout**

```tsx
// src/app/(app)/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/requireRole";
import { logout } from "@/app/logout/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-60 flex-none flex-col gap-10 bg-[#4a2e1c] px-6 py-8">
        <div className="flex flex-col gap-1">
          <span className="font-display text-2xl italic leading-none text-[#f6ecd9]">
            Malaga Soft
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-copper">
            Heladería · Producción
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm font-medium text-[#cfc3ac] hover:bg-white/5 hover:text-[#f6ecd9]"
          >
            Inicio
          </Link>
          <Link
            href="/productos"
            className="rounded-md px-3 py-2 text-sm font-medium text-[#cfc3ac] hover:bg-white/5 hover:text-[#f6ecd9]"
          >
            Productos
          </Link>
          <Link
            href="/recetas"
            className="rounded-md px-3 py-2 text-sm font-medium text-[#cfc3ac] hover:bg-white/5 hover:text-[#f6ecd9]"
          >
            Recetas
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-3 text-[11px] text-[#8a9a90]">
          <div>
            <div className="font-semibold text-[#cfc3ac]">{user.email}</div>
            <div>{user.rol}</div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-left text-[11px] font-medium text-[#8a9a90] hover:text-copper"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 bg-bg">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Mover la home dentro del grupo y simplificarla (el logout ahora vive en el sidebar)**

```tsx
// src/app/(app)/page.tsx
import { requireUser } from "@/lib/auth/requireRole";

export default async function Home() {
  const user = await requireUser();

  return (
    <div className="p-10">
      <h1 className="mb-2 text-2xl font-semibold text-ink">Hola, {user.email}</h1>
      <p className="text-sm text-ink-soft">
        Elegí un módulo en el menú de la izquierda para empezar.
      </p>
    </div>
  );
}
```

Borrar el `src/app/page.tsx` viejo (queda reemplazado por el de `(app)/`).

- [ ] **Step 3: Verificar en el navegador**

Recargar `/` logueado: debe verse el sidebar con Inicio/Productos/Recetas, el email y rol del usuario, y el botón de cerrar sesión funcionando igual que antes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/" src/app/page.tsx
git commit -m "feat: add app shell with sidebar navigation"
```

---

### Task 3: Módulo de datos — Productos

**Files:**
- Create: `src/lib/productos/queries.ts`
- Test: `src/lib/productos/queries.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// src/lib/productos/queries.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto, listProductos } from "./queries";

describe("productos queries", () => {
  beforeEach(async () => {
    await query("TRUNCATE malaga.d_productos RESTART IDENTITY CASCADE");
  });

  it("crea un producto PT con peso_estandar", async () => {
    const p = await createProducto({
      detalle: "Gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    expect(p.idProd).toBeGreaterThan(0);
    expect(p.tipoProducto).toBe("PT");
  });

  it("rechaza un producto PT sin peso_estandar antes de tocar la base", async () => {
    await expect(
      createProducto({ detalle: "Sin peso", unidMed: "kg", tipoProducto: "PT" })
    ).rejects.toThrow(/peso_estandar/);
  });

  it("permite un producto SEMI sin peso_estandar", async () => {
    const p = await createProducto({ detalle: "Pasta", unidMed: "kg", tipoProducto: "SEMI" });
    expect(p.pesoEstandar).toBeNull();
  });

  it("lista productos ordenados por tipo y detalle", async () => {
    await createProducto({
      detalle: "Vainilla",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    await createProducto({ detalle: "Pasta", unidMed: "kg", tipoProducto: "SEMI" });

    const list = await listProductos();
    expect(list.map((p) => p.detalle)).toEqual(["Vainilla", "Pasta"]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test:db -- run src/lib/productos/queries.test.ts`
Expected: FAIL con `Cannot find module './queries'`

- [ ] **Step 3: Implementar**

```typescript
// src/lib/productos/queries.ts
import { query } from "../db";

export type TipoProducto = "PT" | "SEMI";

export interface Producto {
  idProd: number;
  detalle: string;
  sector: string | null;
  familia: string | null;
  unidMed: string;
  tipoProducto: TipoProducto;
  pesoEstandar: string | null;
  activo: boolean;
}

interface ProductoRow {
  id_prod: number;
  detalle: string;
  sector: string | null;
  familia: string | null;
  unid_med: string;
  tipo_producto: TipoProducto;
  peso_estandar: string | null;
  activo: boolean;
}

function mapRow(row: ProductoRow): Producto {
  return {
    idProd: row.id_prod,
    detalle: row.detalle,
    sector: row.sector,
    familia: row.familia,
    unidMed: row.unid_med,
    tipoProducto: row.tipo_producto,
    pesoEstandar: row.peso_estandar,
    activo: row.activo,
  };
}

export async function listProductos(): Promise<Producto[]> {
  const result = await query<ProductoRow>(
    `SELECT id_prod, detalle, sector, familia, unid_med, tipo_producto, peso_estandar, activo
     FROM malaga.d_productos
     ORDER BY tipo_producto, detalle`
  );
  return result.rows.map(mapRow);
}

export interface CreateProductoInput {
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

  const result = await query<ProductoRow>(
    `INSERT INTO malaga.d_productos (detalle, sector, familia, unid_med, tipo_producto, peso_estandar)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id_prod, detalle, sector, familia, unid_med, tipo_producto, peso_estandar, activo`,
    [
      input.detalle,
      input.sector ?? null,
      input.familia ?? null,
      input.unidMed,
      input.tipoProducto,
      input.pesoEstandar ?? null,
    ]
  );
  return mapRow(result.rows[0]);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test:db -- run src/lib/productos/queries.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/productos/
git commit -m "feat: add productos data module with peso_estandar validation"
```

---

### Task 4: UI — Productos (listado y alta)

**Files:**
- Create: `src/app/(app)/productos/page.tsx`
- Create: `src/app/(app)/productos/nuevo/page.tsx`
- Create: `src/app/(app)/productos/nuevo/actions.ts`

- [ ] **Step 1: Listado**

```tsx
// src/app/(app)/productos/page.tsx
import Link from "next/link";
import { listProductos } from "@/lib/productos/queries";

export default async function ProductosPage() {
  const productos = await listProductos();

  return (
    <div className="p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Productos</h1>
        <Link
          href="/productos/nuevo"
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white"
        >
          Nuevo producto
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3">Detalle</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3 text-right">Peso estándar</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.idProd} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{p.detalle}</td>
                <td className="px-4 py-3 text-ink-soft">{p.tipoProducto}</td>
                <td className="px-4 py-3 text-ink-soft">{p.unidMed}</td>
                <td className="px-4 py-3 text-right font-mono text-ink-soft">
                  {p.pesoEstandar ? `${p.pesoEstandar} ${p.unidMed}` : "—"}
                </td>
                <td className="px-4 py-3 text-ink-soft">{p.activo ? "Activo" : "Inactivo"}</td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                  Todavía no hay productos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Server action de alta**

```typescript
// src/app/(app)/productos/nuevo/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { createProducto } from "@/lib/productos/queries";

export async function crearProducto(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  await requireRole(["gestion", "admin"]);

  const detalle = String(formData.get("detalle") ?? "").trim();
  const unidMed = String(formData.get("unidMed") ?? "").trim();
  const tipoProducto = String(formData.get("tipoProducto") ?? "");
  const sector = String(formData.get("sector") ?? "").trim() || undefined;
  const familia = String(formData.get("familia") ?? "").trim() || undefined;
  const pesoEstandarRaw = String(formData.get("pesoEstandar") ?? "").trim();

  if (!detalle || !unidMed || (tipoProducto !== "PT" && tipoProducto !== "SEMI")) {
    return { error: "Completá detalle, unidad de medida y tipo de producto." };
  }

  const pesoEstandar = pesoEstandarRaw ? Number(pesoEstandarRaw) : undefined;

  try {
    await createProducto({
      detalle,
      unidMed,
      tipoProducto: tipoProducto as "PT" | "SEMI",
      sector,
      familia,
      pesoEstandar,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear el producto." };
  }

  redirect("/productos");
}
```

- [ ] **Step 3: Página de alta**

```tsx
// src/app/(app)/productos/nuevo/page.tsx
"use client";

import { useActionState, useState } from "react";
import { crearProducto } from "./actions";

export default function NuevoProductoPage() {
  const [state, formAction, pending] = useActionState(crearProducto, undefined);
  const [tipoProducto, setTipoProducto] = useState("PT");

  return (
    <div className="p-10">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Nuevo producto</h1>

      <form action={formAction} className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Detalle
          <input
            name="detalle"
            required
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Tipo de producto
          <select
            name="tipoProducto"
            value={tipoProducto}
            onChange={(e) => setTipoProducto(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          >
            <option value="PT">PT (producto terminado)</option>
            <option value="SEMI">SEMI (semielaborado)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Unidad de medida
          <input
            name="unidMed"
            required
            placeholder="kg"
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>

        {tipoProducto === "PT" && (
          <label className="flex flex-col gap-1 text-sm text-ink">
            Peso estándar de bacha
            <input
              name="pesoEstandar"
              type="number"
              step="0.001"
              required
              className="rounded-md border border-border bg-surface-raised px-3 py-2"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm text-ink">
          Sector (opcional)
          <input name="sector" className="rounded-md border border-border bg-surface-raised px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Familia (opcional)
          <input name="familia" className="rounded-md border border-border bg-surface-raised px-3 py-2" />
        </label>

        {state?.error && <p className="text-sm text-bad">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Crear producto"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verificar en el navegador**

Loguearse, ir a `/productos`, crear un producto SEMI y uno PT (confirmar que PT exige peso estándar), ver que ambos aparecen en el listado con los datos correctos.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/productos/"
git commit -m "feat: add productos list and create pages"
```

---

### Task 5: Módulo de datos — Recetas (versionado)

**Files:**
- Create: `src/lib/recetas/queries.ts`
- Test: `src/lib/recetas/queries.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// src/lib/recetas/queries.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { createReceta, listRecetasActivas } from "./queries";

describe("recetas queries", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.recetas_detalles, malaga.recetas, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("crea la versión 1 de una receta con sus ingredientes", async () => {
    const userAlta = await seedUser();
    const pt = await createProducto({
      detalle: "Helado gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    const semi = await createProducto({ detalle: "Pasta gianduia", unidMed: "kg", tipoProducto: "SEMI" });

    const receta = await createReceta({
      idProd: pt.idProd,
      items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }],
      userAlta,
    });

    expect(receta.version).toBe(1);
    expect(receta.activa).toBe(true);
  });

  it("una nueva versión desactiva la anterior", async () => {
    const userAlta = await seedUser();
    const pt = await createProducto({
      detalle: "Helado gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    const semi = await createProducto({ detalle: "Pasta gianduia", unidMed: "kg", tipoProducto: "SEMI" });

    const v1 = await createReceta({
      idProd: pt.idProd,
      items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }],
      userAlta,
    });
    const v2 = await createReceta({
      idProd: pt.idProd,
      items: [{ idSubprod: semi.idProd, cantSubprod: 0.6 }],
      userAlta,
    });

    expect(v2.version).toBe(2);

    const activas = await listRecetasActivas();
    const idsActivos = activas.map((r) => r.idReceta);
    expect(idsActivos).toContain(v2.idReceta);
    expect(idsActivos).not.toContain(v1.idReceta);
  });

  it("rechaza una receta que se referencia a sí misma como ingrediente", async () => {
    const userAlta = await seedUser();
    const pt = await createProducto({
      detalle: "Helado gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });

    await expect(
      createReceta({ idProd: pt.idProd, items: [{ idSubprod: pt.idProd, cantSubprod: 1 }], userAlta })
    ).rejects.toThrow(/mismo/);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test:db -- run src/lib/recetas/queries.test.ts`
Expected: FAIL con `Cannot find module './queries'`

- [ ] **Step 3: Implementar**

```typescript
// src/lib/recetas/queries.ts
import { query, withTransaction } from "../db";

export interface RecetaItemInput {
  idSubprod: number;
  cantSubprod: number;
}

export interface CreateRecetaInput {
  idProd: number;
  items: RecetaItemInput[];
  userAlta: number;
}

export interface Receta {
  idReceta: number;
  idProd: number;
  version: number;
  activa: boolean;
}

export async function createReceta(input: CreateRecetaInput): Promise<Receta> {
  if (input.items.length === 0) {
    throw new Error("La receta necesita al menos un ingrediente");
  }
  for (const item of input.items) {
    if (item.idSubprod === input.idProd) {
      throw new Error("Un producto no puede ser ingrediente de sí mismo");
    }
  }

  return withTransaction(async (client) => {
    const versionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM malaga.recetas WHERE id_prod = $1`,
      [input.idProd]
    );
    const nextVersion = versionResult.rows[0].next_version;

    await client.query(`UPDATE malaga.recetas SET activa = false WHERE id_prod = $1`, [input.idProd]);

    const recetaResult = await client.query<{ id_receta: number }>(
      `INSERT INTO malaga.recetas (id_prod, version, activa, user_alta)
       VALUES ($1, $2, true, $3) RETURNING id_receta`,
      [input.idProd, nextVersion, input.userAlta]
    );
    const idReceta = recetaResult.rows[0].id_receta;

    for (const item of input.items) {
      await client.query(
        `INSERT INTO malaga.recetas_detalles (id_receta, id_prod_padre, id_subprod, cant_subprod)
         VALUES ($1, $2, $3, $4)`,
        [idReceta, input.idProd, item.idSubprod, item.cantSubprod]
      );
    }

    return { idReceta, idProd: input.idProd, version: nextVersion, activa: true };
  });
}

export interface RecetaConDetalle {
  idReceta: number;
  idProd: number;
  productoDetalle: string;
  version: number;
  activa: boolean;
  items: Array<{ idSubprod: number; subprodDetalle: string; cantSubprod: string }>;
}

export async function listRecetasActivas(): Promise<RecetaConDetalle[]> {
  const recetasResult = await query<{
    id_receta: number;
    id_prod: number;
    producto_detalle: string;
    version: number;
    activa: boolean;
  }>(
    `SELECT r.id_receta, r.id_prod, p.detalle AS producto_detalle, r.version, r.activa
     FROM malaga.recetas r
     JOIN malaga.d_productos p ON p.id_prod = r.id_prod
     WHERE r.activa = true
     ORDER BY p.detalle`
  );

  const recetas: RecetaConDetalle[] = [];
  for (const r of recetasResult.rows) {
    const itemsResult = await query<{
      id_subprod: number;
      subprod_detalle: string;
      cant_subprod: string;
    }>(
      `SELECT rd.id_subprod, sp.detalle AS subprod_detalle, rd.cant_subprod
       FROM malaga.recetas_detalles rd
       JOIN malaga.d_productos sp ON sp.id_prod = rd.id_subprod
       WHERE rd.id_receta = $1
       ORDER BY sp.detalle`,
      [r.id_receta]
    );
    recetas.push({
      idReceta: r.id_receta,
      idProd: r.id_prod,
      productoDetalle: r.producto_detalle,
      version: r.version,
      activa: r.activa,
      items: itemsResult.rows.map((i) => ({
        idSubprod: i.id_subprod,
        subprodDetalle: i.subprod_detalle,
        cantSubprod: i.cant_subprod,
      })),
    });
  }
  return recetas;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test:db -- run src/lib/recetas/queries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/recetas/
git commit -m "feat: add recetas data module with versioning logic"
```

---

### Task 6: UI — Recetas (listado y alta con ingredientes dinámicos)

**Files:**
- Create: `src/app/(app)/recetas/page.tsx`
- Create: `src/app/(app)/recetas/nueva/actions.ts`
- Create: `src/app/(app)/recetas/nueva/RecetaForm.tsx`
- Create: `src/app/(app)/recetas/nueva/page.tsx`

- [ ] **Step 1: Listado**

```tsx
// src/app/(app)/recetas/page.tsx
import Link from "next/link";
import { listRecetasActivas } from "@/lib/recetas/queries";

export default async function RecetasPage() {
  const recetas = await listRecetasActivas();

  return (
    <div className="p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Recetas</h1>
        <Link
          href="/recetas/nueva"
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white"
        >
          Nueva receta
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {recetas.map((r) => (
          <div key={r.idReceta} className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-ink">{r.productoDetalle}</h2>
              <span className="font-mono text-xs text-ink-soft">v{r.version}</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm text-ink-soft">
              {r.items.map((item) => (
                <li key={item.idSubprod}>
                  {item.cantSubprod} × {item.subprodDetalle}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {recetas.length === 0 && (
          <p className="text-sm text-ink-soft">Todavía no hay recetas cargadas.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Server action de alta**

```typescript
// src/app/(app)/recetas/nueva/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { createReceta } from "@/lib/recetas/queries";

export async function crearRecetaAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin"]);

  const idProd = Number(formData.get("idProd"));
  const idsSubprod = formData.getAll("idSubprod").map(Number);
  const cantidades = formData.getAll("cantSubprod").map(Number);

  if (!idProd || idsSubprod.length === 0) {
    return { error: "Elegí un producto y al menos un ingrediente." };
  }

  const items = idsSubprod.map((idSubprod, i) => ({ idSubprod, cantSubprod: cantidades[i] }));

  if (items.some((item) => !item.idSubprod || !item.cantSubprod || item.cantSubprod <= 0)) {
    return { error: "Todos los ingredientes necesitan producto y cantidad mayor a cero." };
  }

  try {
    await createReceta({ idProd, items, userAlta: user.idUser });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear la receta." };
  }

  redirect("/recetas");
}
```

- [ ] **Step 3: Formulario cliente con filas dinámicas**

```tsx
// src/app/(app)/recetas/nueva/RecetaForm.tsx
"use client";

import { useActionState, useState } from "react";
import { crearRecetaAction } from "./actions";
import type { Producto } from "@/lib/productos/queries";

export function RecetaForm({ productos }: { productos: Producto[] }) {
  const [state, formAction, pending] = useActionState(crearRecetaAction, undefined);
  const [rows, setRows] = useState([0]);

  const productosPT = productos.filter((p) => p.tipoProducto === "PT");

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Producto a fabricar
        <select name="idProd" required className="rounded-md border border-border bg-surface-raised px-3 py-2">
          <option value="">Elegí un producto...</option>
          {productosPT.map((p) => (
            <option key={p.idProd} value={p.idProd}>
              {p.detalle}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-ink">Ingredientes</span>
        {rows.map((rowId) => (
          <div key={rowId} className="flex gap-2">
            <select
              name="idSubprod"
              required
              className="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2"
            >
              <option value="">Elegí un ingrediente...</option>
              {productos.map((p) => (
                <option key={p.idProd} value={p.idProd}>
                  {p.detalle} ({p.tipoProducto})
                </option>
              ))}
            </select>
            <input
              name="cantSubprod"
              type="number"
              step="0.001"
              required
              placeholder="Cantidad"
              className="w-28 rounded-md border border-border bg-surface-raised px-3 py-2"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((r) => [...r, r.length])}
          className="self-start text-sm font-medium text-copper hover:text-copper-strong"
        >
          + Agregar ingrediente
        </button>
      </div>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Crear receta"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Página de alta**

```tsx
// src/app/(app)/recetas/nueva/page.tsx
import { listProductos } from "@/lib/productos/queries";
import { RecetaForm } from "./RecetaForm";

export default async function NuevaRecetaPage() {
  const productos = await listProductos();

  return (
    <div className="p-10">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Nueva receta</h1>
      <RecetaForm productos={productos} />
    </div>
  );
}
```

- [ ] **Step 5: Verificar en el navegador**

Con los productos PT/SEMI creados en la Task 4: ir a `/recetas/nueva`, elegir el PT, agregar el SEMI como ingrediente con "+ Agregar ingrediente", guardar. Confirmar que aparece en `/recetas` con v1. Crear una segunda versión para el mismo producto y confirmar que el listado ahora muestra v2 (no las dos).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/recetas/"
git commit -m "feat: add recetas list and create pages with dynamic ingredient rows"
```

---

## Self-Review

**1. Cobertura del spec:**
- Módulo Recetas: "alta/edición versionada, multinivel" (sección 6) → Task 5-6. Multinivel se cumple porque un ingrediente puede ser cualquier producto, incluido otro SEMI con receta propia — no hay restricción de profundidad.
- `activa` como "cuál versión rige hoy" (sección 5, tabla `recetas`) → Task 5, `createReceta` desactiva todas las versiones previas del mismo producto en la misma transacción antes de insertar la nueva.
- `peso_estandar` obligatorio para PT (sección 5/7) → validado en `createProducto` antes de tocar la base (además del `CHECK` de la Fase 1 a nivel DB — doble capa, mensaje de error legible en vez de un error crudo de Postgres).
- Roles (`produccion`/`gestion`/`admin`) → `requireRole(["gestion", "admin"])` gatea las mutaciones; cualquier usuario logueado puede ver los listados.

**2. Placeholders:** ninguno.

**3. Consistencia de tipos:** `Producto`/`TipoProducto` definidos una sola vez en `src/lib/productos/queries.ts` y reusados (no redefinidos) en `RecetaForm.tsx` y en las acciones de recetas.

**Fuera de esta fase:** edición/baja de productos y recetas existentes, vista de historial de versiones anteriores (hoy `listRecetasActivas` solo trae la versión activa), UI para semielaborados con receta propia anidada visualmente (hoy se ve como una fila más, no hay drill-down).

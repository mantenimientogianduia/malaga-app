# Malaga Soft — Fase 5: Cartilla y Planificación Diaria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el círculo que quedó abierto en la Fase 4 (una OP finalizada genera stock "en obrador", pero nada lo pasa a la vitrina) y dar la pantalla central del día a día: planificación diaria por slot, con cambio de sabor por vencimiento de carta y ajuste de mínimo.

**Architecture:** `v_planificacion_diaria` (de la Fase 1) ya calcula todo lo necesario — stock actual, faltante y bachas sugeridas por slot — así que la pantalla de planificación es una lectura directa de esa vista, sin lógica nueva de cálculo. Las dos escrituras nuevas son deliberadamente simples: cambiar qué producto ocupa un slot (`d_exhibidora`), y mover una partida de "obrador" a "vitrina" (`f_partidas_stock.ts_exhibicion`). No se construye "cambio de carta programado" (`ts_cambio_programado`) en v1 — todo cambio de sabor es inmediato; programar un cambio a futuro queda fuera de alcance.

**Tech Stack:** igual que las fases anteriores, sin dependencias nuevas.

---

### Task 1: Módulo de datos — Exhibidora / Cartilla

**Files:**
- Create: `src/lib/exhibidora/queries.ts`
- Test: `src/lib/exhibidora/queries.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// src/lib/exhibidora/queries.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import {
  actualizarMinimo,
  cambiarSaborSlot,
  exhibirPartida,
  listPartidasEnObrador,
} from "./queries";

describe("exhibidora queries", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("cambiar el sabor de un slot guarda el sabor anterior", async () => {
    const p1 = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const p2 = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p1.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await cambiarSaborSlot(idExhibidora, p2.idProd);

    const result = await query<{ id_prod: number; id_prod_ant: number }>(
      `SELECT id_prod, id_prod_ant FROM malaga.d_exhibidora WHERE id_exhibidora = $1`,
      [idExhibidora]
    );
    expect(result.rows[0].id_prod).toBe(p2.idProd);
    expect(result.rows[0].id_prod_ant).toBe(p1.idProd);
  });

  it("exhibir una partida la hace aparecer en stock vigente y reemplaza a la anterior del mismo slot", async () => {
    const userExhibicion = await seedUser();
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [producto.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    const partida1 = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1') RETURNING id_partistock`,
      [producto.idProd]
    );
    const partida2 = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-02', 'L2') RETURNING id_partistock`,
      [producto.idProd]
    );

    await exhibirPartida(partida1.rows[0].id_partistock, idExhibidora, userExhibicion);
    let vivo = await query<{ lote: string }>("SELECT lote FROM malaga.v_stock_pt_vivo");
    expect(vivo.rows.map((r) => r.lote)).toEqual(["L1"]);

    await exhibirPartida(partida2.rows[0].id_partistock, idExhibidora, userExhibicion);
    vivo = await query<{ lote: string }>("SELECT lote FROM malaga.v_stock_pt_vivo");
    expect(vivo.rows.map((r) => r.lote)).toEqual(["L2"]);
  });

  it("actualizarMinimo cambia la cantidad_minima del slot", async () => {
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, cantidad_minima) VALUES (1, $1, 2) RETURNING id_exhibidora`,
      [producto.idProd]
    );
    const idExhibidora = exhib.rows[0].id_exhibidora;

    await actualizarMinimo(idExhibidora, 5);

    const result = await query<{ cantidad_minima: string }>(
      `SELECT cantidad_minima FROM malaga.d_exhibidora WHERE id_exhibidora = $1`,
      [idExhibidora]
    );
    expect(Number(result.rows[0].cantidad_minima)).toBe(5);
  });

  it("listPartidasEnObrador solo muestra partidas PT sin exhibir", async () => {
    const producto = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 4, '2026-08-01', 'L1')`,
      [producto.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion)
       VALUES ($1, 4, '2026-08-02', 'L2', now())`,
      [producto.idProd]
    );

    const enObrador = await listPartidasEnObrador();
    expect(enObrador.map((p) => p.lote)).toEqual(["L1"]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test:db -- run src/lib/exhibidora/queries.test.ts`
Expected: FAIL con `Cannot find module './queries'`

- [ ] **Step 3: Implementar**

```typescript
// src/lib/exhibidora/queries.ts
import { query } from "../db";

export interface SlotPlanificacion {
  idExhibidora: number;
  nro: number;
  sucursal: string;
  idProd: number;
  productoDetalle: string;
  pesoEstandar: string;
  cantidadMinima: string;
  stockActual: string;
  faltante: string;
  bachasSugeridas: number;
  cantidadSugerida: string;
}

export async function listPlanificacion(): Promise<SlotPlanificacion[]> {
  const result = await query<{
    id_exhibidora: number;
    nro: number;
    sucursal: string;
    id_prod: number;
    producto_detalle: string;
    peso_estandar: string;
    cantidad_minima: string;
    stock_actual: string;
    faltante: string;
    bachas_sugeridas: string;
    cantidad_sugerida: string;
  }>(
    `SELECT id_exhibidora, nro, sucursal, id_prod, producto_detalle, peso_estandar,
            cantidad_minima, stock_actual, faltante, bachas_sugeridas, cantidad_sugerida
     FROM malaga.v_planificacion_diaria
     ORDER BY nro`
  );
  return result.rows.map((r) => ({
    idExhibidora: r.id_exhibidora,
    nro: r.nro,
    sucursal: r.sucursal,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    pesoEstandar: r.peso_estandar,
    cantidadMinima: r.cantidad_minima,
    stockActual: r.stock_actual,
    faltante: r.faltante,
    bachasSugeridas: Number(r.bachas_sugeridas),
    cantidadSugerida: r.cantidad_sugerida,
  }));
}

export async function cambiarSaborSlot(idExhibidora: number, idProdNuevo: number): Promise<void> {
  await query(
    `UPDATE malaga.d_exhibidora
     SET id_prod_ant = id_prod, id_prod = $2, ts_ulticambio = now()
     WHERE id_exhibidora = $1`,
    [idExhibidora, idProdNuevo]
  );
}

export async function actualizarMinimo(idExhibidora: number, cantidadMinima: number): Promise<void> {
  await query(`UPDATE malaga.d_exhibidora SET cantidad_minima = $2 WHERE id_exhibidora = $1`, [
    idExhibidora,
    cantidadMinima,
  ]);
}

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

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test:db -- run src/lib/exhibidora/queries.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/exhibidora/
git commit -m "feat: add exhibidora data module (cartilla, minimos, exhibir partida)"
```

---

### Task 2: UI — Planificación diaria

**Files:**
- Create: `src/app/(app)/planificacion/page.tsx`
- Create: `src/app/(app)/planificacion/actions.ts`
- Create: `src/app/(app)/planificacion/SlotCard.tsx`
- Modify: `src/app/(app)/layout.tsx` (agregar link "Planificación")

- [ ] **Step 1: Server actions**

```typescript
// src/app/(app)/planificacion/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { actualizarMinimo, cambiarSaborSlot } from "@/lib/exhibidora/queries";

export async function cambiarSaborAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  const idProdNuevo = Number(formData.get("idProdNuevo"));
  if (!idExhibidora || !idProdNuevo) return;
  await cambiarSaborSlot(idExhibidora, idProdNuevo);
  revalidatePath("/planificacion");
}

export async function actualizarMinimoAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  const cantidadMinima = Number(formData.get("cantidadMinima"));
  if (!idExhibidora || Number.isNaN(cantidadMinima) || cantidadMinima < 0) return;
  await actualizarMinimo(idExhibidora, cantidadMinima);
  revalidatePath("/planificacion");
}
```

- [ ] **Step 2: Componente de tarjeta por slot**

```tsx
// src/app/(app)/planificacion/SlotCard.tsx
import Link from "next/link";
import type { SlotPlanificacion } from "@/lib/exhibidora/queries";
import type { Producto } from "@/lib/productos/queries";
import { cambiarSaborAction, actualizarMinimoAction } from "./actions";

export function SlotCard({ slot, productosPT }: { slot: SlotPlanificacion; productosPT: Producto[] }) {
  const faltante = Number(slot.faltante);
  const estado = slot.bachasSugeridas > 0 ? (faltante > Number(slot.cantidadMinima) * 0.5 ? "bad" : "warn") : "ok";
  const colorClass = estado === "bad" ? "text-bad" : estado === "warn" ? "text-warn" : "text-ok";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-ink-soft">Slot {slot.nro}</span>
        {slot.bachasSugeridas > 0 && (
          <Link
            href={`/ordenes/nueva?idProd=${slot.idProd}`}
            className={`text-[10.5px] font-semibold ${colorClass} hover:underline`}
          >
            Producir {slot.bachasSugeridas} OP
          </Link>
        )}
      </div>

      <div className="mb-3 text-sm font-semibold text-ink">{slot.productoDetalle}</div>

      <div className="mb-3 flex items-baseline gap-2 font-mono text-xs text-ink-soft">
        <span className={colorClass}>{slot.stockActual}</span>
        <span>/ mín. {slot.cantidadMinima} kg</span>
      </div>

      <form action={actualizarMinimoAction} className="mb-2 flex gap-2">
        <input type="hidden" name="idExhibidora" value={slot.idExhibidora} />
        <input
          name="cantidadMinima"
          type="number"
          step="0.001"
          defaultValue={slot.cantidadMinima}
          className="w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs"
        />
        <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
          Guardar mín.
        </button>
      </form>

      <form action={cambiarSaborAction} className="flex gap-2">
        <input type="hidden" name="idExhibidora" value={slot.idExhibidora} />
        <select
          name="idProdNuevo"
          defaultValue=""
          className="flex-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs"
        >
          <option value="" disabled>
            Cambiar sabor...
          </option>
          {productosPT.map((p) => (
            <option key={p.idProd} value={p.idProd}>
              {p.detalle}
            </option>
          ))}
        </select>
        <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
          Aplicar
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Página**

```tsx
// src/app/(app)/planificacion/page.tsx
import { listPlanificacion } from "@/lib/exhibidora/queries";
import { listProductos } from "@/lib/productos/queries";
import { SlotCard } from "./SlotCard";

export default async function PlanificacionPage() {
  const [slots, productos] = await Promise.all([listPlanificacion(), listProductos()]);
  const productosPT = productos.filter((p) => p.tipoProducto === "PT");
  const conFaltante = slots.filter((s) => s.bachasSugeridas > 0).length;

  return (
    <div className="p-10">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-ink">Planificación diaria</h1>
        <span className="text-sm text-ink-soft">
          {conFaltante} de {slots.length} slots por debajo del mínimo
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {slots.map((slot) => (
          <SlotCard key={slot.idExhibidora} slot={slot} productosPT={productosPT} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Pre-completar el producto en "Nueva OP" desde el link de planificación**

`useSearchParams` exige un `<Suspense>` alrededor del componente que lo usa (si no, Next.js tira warning/error). Envolver `<NuevaOrdenForm />` con `<Suspense>` en `src/app/(app)/ordenes/nueva/page.tsx`.

Modificar `src/app/(app)/ordenes/nueva/NuevaOrdenForm.tsx` para leer `?idProd=` de la URL y preseleccionarlo:

No usar `useEffect` para leer el query param: el linter de React (`react-hooks/set-state-in-effect`) rechaza llamar a `setState` de forma síncrona dentro de un efecto. En vez de eso, derivar el estado inicial directamente del `searchParams` en el cuerpo del componente (se lee una sola vez, al montar, que es exactamente lo que se necesita acá):

```tsx
// src/app/(app)/ordenes/nueva/NuevaOrdenForm.tsx
"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { crearOrdenAction } from "./actions";
import type { ProductoConReceta } from "@/lib/ordenes/queries";

export function NuevaOrdenForm({ productos }: { productos: ProductoConReceta[] }) {
  const [state, formAction, pending] = useActionState(crearOrdenAction, undefined);
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);

  const idProdInicial = searchParams.get("idProd") ?? "";
  const productoInicial = productos.find((p) => String(p.idProd) === idProdInicial);

  const [idProdSeleccionado, setIdProdSeleccionado] = useState(productoInicial ? idProdInicial : "");
  const [cantPlan, setCantPlan] = useState(productoInicial?.pesoEstandar ?? "");

  function handleProductoChange(idProd: string) {
    setIdProdSeleccionado(idProd);
    const producto = productos.find((p) => String(p.idProd) === idProd);
    if (producto?.pesoEstandar) {
      setCantPlan(producto.pesoEstandar);
    }
  }

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Producto
        <select
          name="idProd"
          required
          value={idProdSeleccionado}
          onChange={(e) => handleProductoChange(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <option value="">Elegí un producto...</option>
          {productos.map((p) => (
            <option key={p.idProd} value={p.idProd}>
              {p.detalle} ({p.tipoProducto})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Cantidad planificada
        <input
          name="cantPlan"
          type="number"
          step="0.001"
          required
          value={cantPlan}
          onChange={(e) => setCantPlan(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Fecha planificada
        <input
          name="fechaPlan"
          type="date"
          required
          defaultValue={today}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        />
      </label>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Crear OP"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Agregar el link al sidebar**

En `src/app/(app)/layout.tsx`, agregar "Planificación" (por ejemplo, primero en la lista, es la pantalla de uso diario).

- [ ] **Step 6: Verificar en el navegador**

Con los 24 slots reales ya cargados: entrar a `/planificacion`, confirmar que se ven los 24 sabores con su stock real. Cambiar el mínimo de un slot a un valor alto para forzar que aparezca "Producir N OP", hacer click y confirmar que `/ordenes/nueva` llega con el producto y la cantidad ya precargados. Probar "Cambiar sabor" en un slot y confirmar que el listado se actualiza.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/planificacion" "src/app/(app)/ordenes/nueva/NuevaOrdenForm.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat: add daily planning screen with cartilla management"
```

---

### Task 3: UI — Stock "en obrador" y acción de exhibir

**Files:**
- Modify: `src/app/(app)/stock/page.tsx`
- Modify: `src/app/(app)/stock/actions.ts`

- [ ] **Step 1: Agregar la server action de exhibir**

```typescript
// src/app/(app)/stock/actions.ts — agregar a lo ya existente
import { exhibirPartida } from "@/lib/exhibidora/queries";

export async function exhibirPartidaAction(formData: FormData) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const idExhibidora = Number(formData.get("idExhibidora"));
  if (!idPartida || !idExhibidora) return;

  await exhibirPartida(idPartida, idExhibidora, user.idUser);
  revalidatePath("/stock");
}
```

- [ ] **Step 2: Sección "En obrador" en la página de stock**

Agregar antes de la sección "Producto terminado — vigente" en `src/app/(app)/stock/page.tsx`:

```tsx
import { listPartidasEnObrador } from "@/lib/exhibidora/queries";
import { exhibirPartidaAction } from "./actions";

// dentro del componente, junto a los otros listStock*:
const enObrador = await listPartidasEnObrador();
```

```tsx
<section className="mb-10">
  <h2 className="mb-3 text-base font-semibold text-ink">En obrador — sin exhibir</h2>
  <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
          <th className="px-4 py-3">Producto</th>
          <th className="px-4 py-3">Lote</th>
          <th className="px-4 py-3 text-right">Cantidad</th>
          <th className="px-4 py-3">Fecha fab.</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {enObrador.map((p) => (
          <tr key={p.idPartida} className="border-b border-border last:border-0">
            <td className="px-4 py-3 font-medium text-ink">{p.productoDetalle}</td>
            <td className="px-4 py-3 font-mono text-ink-soft">{p.lote}</td>
            <td className="px-4 py-3 text-right font-mono text-ink-soft">{p.cantidad}</td>
            <td className="px-4 py-3 text-ink-soft">{p.fechaFab}</td>
            <td className="px-4 py-3">
              {p.idExhibidoraDestino ? (
                <form action={exhibirPartidaAction}>
                  <input type="hidden" name="idPartida" value={p.idPartida} />
                  <input type="hidden" name="idExhibidora" value={p.idExhibidoraDestino} />
                  <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                    Exhibir
                  </button>
                </form>
              ) : (
                <span className="text-xs text-warn">Sin slot asignado</span>
              )}
            </td>
          </tr>
        ))}
        {enObrador.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
              Nada esperando para exhibirse.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</section>
```

- [ ] **Step 3: Verificar en el navegador**

Crear y finalizar una OP nueva (deja una partida en obrador). Ir a `/stock`, confirmar que aparece en "En obrador" con el botón "Exhibir" (porque el producto ya tiene slot asignado). Exhibirla, confirmar que pasa a la sección "Producto terminado — vigente" y que la partida que estaba antes en ese slot deja de aparecer.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/stock"
git commit -m "feat: add obrador-to-vitrina exhibir action on stock page"
```

---

## Self-Review

**1. Cobertura del spec:**
- Cartilla: "gestión de los 24 slots activos... cambios de carta" (sección 6) → Task 1-2, `cambiarSaborSlot`.
- Mínimo objetivo por slot (sección 5, tabla `d_exhibidora`) → Task 1-2, `actualizarMinimo`.
- "Dar de baja esa mercadería cuando se exhibe" (sección 7, aclarado por el usuario en brainstorming) → Task 1 y 3, `exhibirPartida`, cerrando el hueco dejado explícitamente abierto en la Fase 4.
- Planificación diaria basada en `v_planificacion_diaria`, sugerencia en bachas (sección 6/7) → Task 2, lectura directa de la vista ya construida en la Fase 1.
- "Cambio de carta programado" (`ts_cambio_programado`) → explícitamente fuera de alcance v1 (ver Architecture).

**2. Placeholders:** ninguno.

**3. Consistencia de tipos:** `SlotPlanificacion` se define una sola vez en `src/lib/exhibidora/queries.ts` y se reusa en `SlotCard.tsx` sin redefinir.

**Fuera de esta fase:** cambio de carta programado a futuro, historial de cambios de sabor por slot (`id_prod_ant` se guarda pero no se muestra en ninguna pantalla todavía), reportes de precisión de planificación (sugerido vs. lo que realmente se terminó produciendo).

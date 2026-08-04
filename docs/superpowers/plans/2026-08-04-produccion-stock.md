# Malaga Soft — Fase 4: Órdenes de Producción y Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear y finalizar órdenes de producción (una OP = una partida, con trazabilidad de qué se consumió para fabricarla), y ver/gestionar el stock en vivo de PT y SEMI, incluyendo el cierre de remanentes de SEMI como scrap.

**Architecture:** `finalizarOrden` es la operación central de esta fase: en una única transacción, inserta la partida de salida (`f_partidas_stock`, con `id_op_origen`), registra el consumo de cada ingrediente (`f_trazabilidad_op`), y marca la OP como `finalizada`. Un `SELECT ... FOR UPDATE` sobre la OP evita que se finalice dos veces en paralelo (que violaría el `UNIQUE` de `id_op_origen`). La carga de consumos **nunca valida contra el stock restante** — es la regla explícita del spec: el pesaje real nunca es exacto, y bloquear la operación por eso sería peor que dejar el dato para revisar después. El módulo de exhibición de PT en la vitrina (asignar una partida a un slot de `d_exhibidora`) queda para la Fase 5 junto con la cartilla, porque no tiene sentido sin una UI de exhibidora que todavía no existe.

**Tech Stack:** igual que las fases anteriores, sin dependencias nuevas.

---

### Task 1: Módulo de datos — Órdenes de producción

**Files:**
- Create: `src/lib/ordenes/queries.ts`
- Test: `src/lib/ordenes/queries.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// src/lib/ordenes/queries.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { createReceta } from "../recetas/queries";
import { createOrdenProduccion, finalizarOrden, getOrdenParaFinalizar, listOrdenes } from "./queries";

describe("ordenes de produccion queries", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  async function seedProductoYReceta(userAlta: number) {
    const pt = await createProducto({
      detalle: "Helado gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    const semi = await createProducto({ detalle: "Pasta gianduia", unidMed: "kg", tipoProducto: "SEMI" });
    await createReceta({
      idProd: pt.idProd,
      items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }],
      userAlta,
    });
    return { pt, semi };
  }

  it("rechaza crear una OP para un producto sin receta activa", async () => {
    const producto = await createProducto({ detalle: "Sin receta", unidMed: "kg", tipoProducto: "SEMI" });
    await expect(
      createOrdenProduccion({ idProd: producto.idProd, cantPlan: 4, fechaPlan: "2026-08-05" })
    ).rejects.toThrow(/receta activa/);
  });

  it("crea una OP planificada tomando la receta activa del producto", async () => {
    const userAlta = await seedUser();
    const { pt } = await seedProductoYReceta(userAlta);

    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    expect(idOp).toBeGreaterThan(0);

    const ordenes = await listOrdenes();
    expect(ordenes).toHaveLength(1);
    expect(ordenes[0].estado).toBe("planificada");
  });

  it("finalizar una OP genera exactamente una partida y registra el consumo", async () => {
    const userAlta = await seedUser();
    const { pt, semi } = await seedProductoYReceta(userAlta);

    const semiPartida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 5, '2026-08-01', 'SEMI-L1') RETURNING id_partistock`,
      [semi.idProd]
    );
    const idPartidaSemi = semiPartida.rows[0].id_partistock;

    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    const detalle = await getOrdenParaFinalizar(idOp);
    expect(detalle?.items).toHaveLength(1);

    const { idPartida } = await finalizarOrden({
      idOp,
      cantReal: 4,
      lote: "PT-L1",
      fechaFab: "2026-08-05",
      userFin: userAlta,
      consumos: [
        {
          idDetalleReceta: detalle!.items[0].idDetalleReceta,
          idSubprod: semi.idProd,
          idPartidaSubprod: idPartidaSemi,
          cantSubprod: 0.5,
        },
      ],
    });

    expect(idPartida).toBeGreaterThan(0);

    const partidaResult = await query<{ id_op_origen: number }>(
      `SELECT id_op_origen FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [idPartida]
    );
    expect(partidaResult.rows[0].id_op_origen).toBe(idOp);

    const trazaResult = await query<{ cant_subprod: string }>(
      `SELECT cant_subprod FROM malaga.f_trazabilidad_op WHERE id_op = $1`,
      [idOp]
    );
    expect(trazaResult.rows).toHaveLength(1);
    expect(Number(trazaResult.rows[0].cant_subprod)).toBe(0.5);

    const ordenes = await listOrdenes();
    expect(ordenes[0].estado).toBe("finalizada");
  });

  it("permite registrar un consumo mayor al stock disponible (nunca bloquea)", async () => {
    const userAlta = await seedUser();
    const { pt, semi } = await seedProductoYReceta(userAlta);

    const semiPartida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 0.2, '2026-08-01', 'SEMI-L1') RETURNING id_partistock`,
      [semi.idProd]
    );
    const idPartidaSemi = semiPartida.rows[0].id_partistock;

    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });
    const detalle = await getOrdenParaFinalizar(idOp);

    // La partida solo tiene 0.2kg pero se consumen 0.5kg — no debe lanzar error.
    await expect(
      finalizarOrden({
        idOp,
        cantReal: 4,
        lote: "PT-L1",
        fechaFab: "2026-08-05",
        userFin: userAlta,
        consumos: [
          {
            idDetalleReceta: detalle!.items[0].idDetalleReceta,
            idSubprod: semi.idProd,
            idPartidaSubprod: idPartidaSemi,
            cantSubprod: 0.5,
          },
        ],
      })
    ).resolves.toBeDefined();
  });

  it("rechaza finalizar una OP que ya está finalizada", async () => {
    const userAlta = await seedUser();
    const { pt } = await seedProductoYReceta(userAlta);
    const { idOp } = await createOrdenProduccion({ idProd: pt.idProd, cantPlan: 4, fechaPlan: "2026-08-05" });

    await finalizarOrden({ idOp, cantReal: 4, lote: "PT-L1", fechaFab: "2026-08-05", userFin: userAlta, consumos: [] });

    await expect(
      finalizarOrden({ idOp, cantReal: 4, lote: "PT-L2", fechaFab: "2026-08-05", userFin: userAlta, consumos: [] })
    ).rejects.toThrow(/ya fue finalizada/);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test:db -- run src/lib/ordenes/queries.test.ts`
Expected: FAIL con `Cannot find module './queries'`

- [ ] **Step 3: Implementar**

```typescript
// src/lib/ordenes/queries.ts
import { query, withTransaction } from "../db";

export type EstadoOrden = "planificada" | "en_proceso" | "finalizada" | "cancelada";

export interface OrdenProduccion {
  idOp: number;
  idProd: number;
  productoDetalle: string;
  cantPlan: string;
  cantReal: string | null;
  fechaPlan: string;
  fechaReal: string | null;
  estado: EstadoOrden;
}

interface OrdenRow {
  id_op: number;
  id_prod: number;
  producto_detalle: string;
  cant_plan: string;
  cant_real: string | null;
  fecha_plan: string;
  fecha_real: string | null;
  estado: EstadoOrden;
}

function mapOrdenRow(row: OrdenRow): OrdenProduccion {
  return {
    idOp: row.id_op,
    idProd: row.id_prod,
    productoDetalle: row.producto_detalle,
    cantPlan: row.cant_plan,
    cantReal: row.cant_real,
    fechaPlan: row.fecha_plan,
    fechaReal: row.fecha_real,
    estado: row.estado,
  };
}

export async function listOrdenes(): Promise<OrdenProduccion[]> {
  const result = await query<OrdenRow>(
    `SELECT o.id_op, o.id_prod, p.detalle AS producto_detalle, o.cant_plan, o.cant_real,
            o.fecha_plan, o.fecha_real, o.estado
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     ORDER BY o.fecha_plan DESC, o.id_op DESC`
  );
  return result.rows.map(mapOrdenRow);
}

export interface ProductoConReceta {
  idProd: number;
  detalle: string;
  tipoProducto: "PT" | "SEMI";
  pesoEstandar: string | null;
}

export async function listProductosConRecetaActiva(): Promise<ProductoConReceta[]> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    tipo_producto: "PT" | "SEMI";
    peso_estandar: string | null;
  }>(
    `SELECT DISTINCT p.id_prod, p.detalle, p.tipo_producto, p.peso_estandar
     FROM malaga.d_productos p
     JOIN malaga.recetas r ON r.id_prod = p.id_prod AND r.activa = true
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    tipoProducto: r.tipo_producto,
    pesoEstandar: r.peso_estandar,
  }));
}

export interface CreateOrdenInput {
  idProd: number;
  cantPlan: number;
  fechaPlan: string;
}

export async function createOrdenProduccion(input: CreateOrdenInput): Promise<{ idOp: number }> {
  const recetaResult = await query<{ id_receta: number }>(
    `SELECT id_receta FROM malaga.recetas WHERE id_prod = $1 AND activa = true`,
    [input.idProd]
  );
  if (recetaResult.rows.length === 0) {
    throw new Error("Este producto no tiene una receta activa; no se puede planificar una OP");
  }
  const idReceta = recetaResult.rows[0].id_receta;

  const result = await query<{ id_op: number }>(
    `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado)
     VALUES ($1, $2, $3, $4, 'planificada') RETURNING id_op`,
    [input.idProd, idReceta, input.cantPlan, input.fechaPlan]
  );
  return { idOp: result.rows[0].id_op };
}

export interface PartidaDisponible {
  idPartida: number;
  lote: string;
  restante: string;
}

export interface RecetaItemParaFinalizar {
  idDetalleReceta: number;
  idSubprod: number;
  subprodDetalle: string;
  cantSugerida: string;
  partidasDisponibles: PartidaDisponible[];
}

export interface OrdenParaFinalizar {
  idOp: number;
  idProd: number;
  productoDetalle: string;
  cantPlan: string;
  estado: EstadoOrden;
  items: RecetaItemParaFinalizar[];
}

export async function getOrdenParaFinalizar(idOp: number): Promise<OrdenParaFinalizar | null> {
  const opResult = await query<{
    id_op: number;
    id_prod: number;
    producto_detalle: string;
    id_receta: number;
    cant_plan: string;
    estado: EstadoOrden;
  }>(
    `SELECT o.id_op, o.id_prod, p.detalle AS producto_detalle, o.id_receta, o.cant_plan, o.estado
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     WHERE o.id_op = $1`,
    [idOp]
  );
  if (opResult.rows.length === 0) return null;
  const op = opResult.rows[0];

  const detallesResult = await query<{
    id_det_receta: number;
    id_subprod: number;
    subprod_detalle: string;
    subprod_tipo: "PT" | "SEMI";
    cant_subprod: string;
  }>(
    `SELECT rd.id_det_receta, rd.id_subprod, sp.detalle AS subprod_detalle, sp.tipo_producto AS subprod_tipo,
            rd.cant_subprod
     FROM malaga.recetas_detalles rd
     JOIN malaga.d_productos sp ON sp.id_prod = rd.id_subprod
     WHERE rd.id_receta = $1
     ORDER BY sp.detalle`,
    [op.id_receta]
  );

  const items: RecetaItemParaFinalizar[] = [];
  for (const d of detallesResult.rows) {
    const partidasResult =
      d.subprod_tipo === "PT"
        ? await query<{ id_partistock: number; lote: string; cantidad: string }>(
            `SELECT id_partistock, lote, cantidad FROM malaga.v_stock_pt_vivo WHERE id_prod = $1 ORDER BY lote`,
            [d.id_subprod]
          )
        : await query<{ id_partistock: number; lote: string; restante: string }>(
            `SELECT id_partistock, lote, restante FROM malaga.v_stock_semi_vivo WHERE id_prod = $1 ORDER BY lote`,
            [d.id_subprod]
          );

    items.push({
      idDetalleReceta: d.id_det_receta,
      idSubprod: d.id_subprod,
      subprodDetalle: d.subprod_detalle,
      cantSugerida: d.cant_subprod,
      partidasDisponibles: partidasResult.rows.map((r) => ({
        idPartida: r.id_partistock,
        lote: r.lote,
        restante: "restante" in r ? r.restante : r.cantidad,
      })),
    });
  }

  return {
    idOp: op.id_op,
    idProd: op.id_prod,
    productoDetalle: op.producto_detalle,
    cantPlan: op.cant_plan,
    estado: op.estado,
    items,
  };
}

export interface ConsumoInput {
  idDetalleReceta: number;
  idSubprod: number;
  idPartidaSubprod: number;
  cantSubprod: number;
}

export interface FinalizarOrdenInput {
  idOp: number;
  cantReal: number;
  lote: string;
  fechaFab: string;
  userFin: number;
  consumos: ConsumoInput[];
}

export async function finalizarOrden(input: FinalizarOrdenInput): Promise<{ idPartida: number }> {
  return withTransaction(async (client) => {
    const opResult = await client.query<{ id_prod: number; id_receta: number; estado: EstadoOrden }>(
      `SELECT id_prod, id_receta, estado FROM malaga.f_ordenes_produccion WHERE id_op = $1 FOR UPDATE`,
      [input.idOp]
    );
    if (opResult.rows.length === 0) {
      throw new Error("OP no encontrada");
    }
    const op = opResult.rows[0];
    if (op.estado === "finalizada") {
      throw new Error("Esta OP ya fue finalizada");
    }
    if (op.estado === "cancelada") {
      throw new Error("Esta OP está cancelada");
    }

    const partidaResult = await client.query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, id_op_origen)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_partistock`,
      [op.id_prod, input.cantReal, input.fechaFab, input.lote, input.idOp]
    );
    const idPartida = partidaResult.rows[0].id_partistock;

    // Regla clave del spec: nunca validar cant_subprod contra el restante calculado.
    // El pesaje real nunca es exacto — se registra igual, y un "restante" negativo
    // en v_stock_semi_vivo queda como señal a revisar, no como bloqueo.
    for (const c of input.consumos) {
      await client.query(
        `INSERT INTO malaga.f_trazabilidad_op
           (id_op, id_receta, id_detalle_receta, id_subprod, cant_subprod, id_parti_subprod, id_prod_op)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [input.idOp, op.id_receta, c.idDetalleReceta, c.idSubprod, c.cantSubprod, c.idPartidaSubprod, op.id_prod]
      );
    }

    await client.query(
      `UPDATE malaga.f_ordenes_produccion
       SET estado = 'finalizada', cant_real = $2, fecha_real = $3, ts_fin = now(), user_fin = $4
       WHERE id_op = $1`,
      [input.idOp, input.cantReal, input.fechaFab, input.userFin]
    );

    return { idPartida };
  });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test:db -- run src/lib/ordenes/queries.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ordenes/
git commit -m "feat: add ordenes de produccion data module (create + finalizar)"
```

---

### Task 2: UI — Órdenes de producción (listado y alta)

**Files:**
- Create: `src/app/(app)/ordenes/page.tsx`
- Create: `src/app/(app)/ordenes/nueva/actions.ts`
- Create: `src/app/(app)/ordenes/nueva/page.tsx`
- Modify: `src/app/(app)/layout.tsx` (agregar link "Órdenes")

- [ ] **Step 1: Listado**

```tsx
// src/app/(app)/ordenes/page.tsx
import Link from "next/link";
import { listOrdenes } from "@/lib/ordenes/queries";

const ESTADO_LABEL: Record<string, string> = {
  planificada: "Planificada",
  en_proceso: "En proceso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export default async function OrdenesPage() {
  const ordenes = await listOrdenes();

  return (
    <div className="p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Órdenes de producción</h1>
        <Link
          href="/ordenes/nueva"
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white"
        >
          Nueva OP
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3">OP</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Plan</th>
              <th className="px-4 py-3 text-right">Real</th>
              <th className="px-4 py-3">Fecha plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => (
              <tr key={o.idOp} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-ink-soft">OP-{o.idOp}</td>
                <td className="px-4 py-3 font-medium text-ink">{o.productoDetalle}</td>
                <td className="px-4 py-3 text-right font-mono text-ink-soft">{o.cantPlan}</td>
                <td className="px-4 py-3 text-right font-mono text-ink-soft">{o.cantReal ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{o.fechaPlan}</td>
                <td className="px-4 py-3 text-ink-soft">{ESTADO_LABEL[o.estado]}</td>
                <td className="px-4 py-3">
                  {o.estado === "planificada" && (
                    <Link
                      href={`/ordenes/${o.idOp}/finalizar`}
                      className="text-sm font-medium text-copper hover:text-copper-strong"
                    >
                      Finalizar
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {ordenes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
                  Todavía no hay órdenes de producción.
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
// src/app/(app)/ordenes/nueva/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { createOrdenProduccion } from "@/lib/ordenes/queries";

export async function crearOrdenAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  await requireRole(["gestion", "admin", "produccion"]);

  const idProd = Number(formData.get("idProd"));
  const cantPlan = Number(formData.get("cantPlan"));
  const fechaPlan = String(formData.get("fechaPlan") ?? "");

  if (!idProd || !cantPlan || cantPlan <= 0 || !fechaPlan) {
    return { error: "Completá producto, cantidad y fecha planificada." };
  }

  try {
    await createOrdenProduccion({ idProd, cantPlan, fechaPlan });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear la OP." };
  }

  redirect("/ordenes");
}
```

- [ ] **Step 3: Página de alta**

```tsx
// src/app/(app)/ordenes/nueva/page.tsx
import { listProductosConRecetaActiva } from "@/lib/ordenes/queries";
import { NuevaOrdenForm } from "./NuevaOrdenForm";

export default async function NuevaOrdenPage() {
  const productos = await listProductosConRecetaActiva();

  return (
    <div className="p-10">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Nueva orden de producción</h1>
      <NuevaOrdenForm productos={productos} />
    </div>
  );
}
```

```tsx
// src/app/(app)/ordenes/nueva/NuevaOrdenForm.tsx
"use client";

import { useActionState, useState } from "react";
import { crearOrdenAction } from "./actions";
import type { ProductoConReceta } from "@/lib/ordenes/queries";

export function NuevaOrdenForm({ productos }: { productos: ProductoConReceta[] }) {
  const [state, formAction, pending] = useActionState(crearOrdenAction, undefined);
  const [cantPlan, setCantPlan] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  function handleProductoChange(idProd: string) {
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

- [ ] **Step 4: Agregar el link al sidebar**

En `src/app/(app)/layout.tsx`, agregar entre "Recetas" y el bloque de usuario:

```tsx
<Link
  href="/ordenes"
  className="rounded-md px-3 py-2 text-sm font-medium text-[#cfc3ac] hover:bg-white/5 hover:text-[#f6ecd9]"
>
  Órdenes
</Link>
```

- [ ] **Step 5: Verificar en el navegador**

Crear una OP para el producto PT que ya tiene receta activa; confirmar que la cantidad se autocompleta con el `peso_estandar` al elegir el producto, y que aparece en el listado como "Planificada" con un link "Finalizar".

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/ordenes" "src/app/(app)/layout.tsx"
git commit -m "feat: add ordenes de produccion list and create pages"
```

---

### Task 3: UI — Finalizar OP (consumo de ingredientes)

**Files:**
- Create: `src/app/(app)/ordenes/[id]/finalizar/page.tsx`
- Create: `src/app/(app)/ordenes/[id]/finalizar/actions.ts`
- Create: `src/app/(app)/ordenes/[id]/finalizar/FinalizarForm.tsx`

- [ ] **Step 1: Server action**

```typescript
// src/app/(app)/ordenes/[id]/finalizar/actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { finalizarOrden } from "@/lib/ordenes/queries";

export async function finalizarOrdenAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idOp = Number(formData.get("idOp"));
  const cantReal = Number(formData.get("cantReal"));
  const lote = String(formData.get("lote") ?? "").trim();
  const fechaFab = String(formData.get("fechaFab") ?? "");

  const idsDetalleReceta = formData.getAll("idDetalleReceta").map(Number);
  const idsSubprod = formData.getAll("idSubprod").map(Number);
  const idsPartida = formData.getAll("idPartidaSubprod").map(Number);
  const cantidades = formData.getAll("cantConsumo").map(Number);

  if (!idOp || !cantReal || cantReal <= 0 || !lote || !fechaFab) {
    return { error: "Completá cantidad real, lote y fecha de fabricación." };
  }

  if (idsPartida.some((id) => !id)) {
    return { error: "Todos los ingredientes necesitan una partida elegida (no hay stock cargado de alguno)." };
  }

  const consumos = idsDetalleReceta.map((idDetalleReceta, i) => ({
    idDetalleReceta,
    idSubprod: idsSubprod[i],
    idPartidaSubprod: idsPartida[i],
    cantSubprod: cantidades[i],
  }));

  try {
    await finalizarOrden({ idOp, cantReal, lote, fechaFab, userFin: user.idUser, consumos });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo finalizar la OP." };
  }

  redirect("/ordenes");
}
```

- [ ] **Step 2: Formulario cliente**

```tsx
// src/app/(app)/ordenes/[id]/finalizar/FinalizarForm.tsx
"use client";

import { useActionState } from "react";
import { finalizarOrdenAction } from "./actions";
import type { OrdenParaFinalizar } from "@/lib/ordenes/queries";

export function FinalizarForm({ orden }: { orden: OrdenParaFinalizar }) {
  const [state, formAction, pending] = useActionState(finalizarOrdenAction, undefined);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="idOp" value={orden.idOp} />

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Cantidad real producida
          <input
            name="cantReal"
            type="number"
            step="0.001"
            required
            defaultValue={orden.cantPlan}
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Fecha de fabricación
          <input
            name="fechaFab"
            type="date"
            required
            defaultValue={today}
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Lote de la partida generada
        <input
          name="lote"
          required
          placeholder={`${orden.productoDetalle}-${today}`}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        />
      </label>

      {orden.items.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-ink">Consumo de ingredientes</span>
          {orden.items.map((item) => (
            <div key={item.idDetalleReceta} className="rounded-md border border-border p-3">
              <input type="hidden" name="idDetalleReceta" value={item.idDetalleReceta} />
              <input type="hidden" name="idSubprod" value={item.idSubprod} />
              <div className="mb-2 text-sm font-medium text-ink">
                {item.subprodDetalle}{" "}
                <span className="font-mono text-xs text-ink-soft">
                  (sugerido: {item.cantSugerida})
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  name="idPartidaSubprod"
                  required
                  className="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                >
                  <option value="">Elegí un lote...</option>
                  {item.partidasDisponibles.map((p) => (
                    <option key={p.idPartida} value={p.idPartida}>
                      {p.lote} (restante: {p.restante})
                    </option>
                  ))}
                </select>
                <input
                  name="cantConsumo"
                  type="number"
                  step="0.001"
                  required
                  defaultValue={item.cantSugerida}
                  className="w-28 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                />
              </div>
              {item.partidasDisponibles.length === 0 && (
                <p className="mt-2 text-xs text-warn">
                  No hay partidas con stock vivo de este ingrediente todavía.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Finalizando..." : "Finalizar OP"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Página**

```tsx
// src/app/(app)/ordenes/[id]/finalizar/page.tsx
import { notFound } from "next/navigation";
import { getOrdenParaFinalizar } from "@/lib/ordenes/queries";
import { FinalizarForm } from "./FinalizarForm";

export default async function FinalizarOrdenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orden = await getOrdenParaFinalizar(Number(id));
  if (!orden) notFound();

  return (
    <div className="p-10">
      <h1 className="mb-1 text-2xl font-semibold text-ink">Finalizar OP-{orden.idOp}</h1>
      <p className="mb-6 text-sm text-ink-soft">{orden.productoDetalle}</p>
      <FinalizarForm orden={orden} />
    </div>
  );
}
```

- [ ] **Step 4: Verificar en el navegador**

Con la OP creada en la Task 2 y una partida SEMI cargada (usar la del final de la Fase 3, o crear una nueva vía consola/próxima fase): ir a "Finalizar", cargar cantidad real, lote, fecha, elegir la partida del ingrediente y su cantidad, confirmar. Revisar que la OP pasa a "Finalizada" en el listado.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/ordenes/[id]"
git commit -m "feat: add finalizar OP page with ingredient consumption form"
```

---

### Task 4: Módulo de datos — Stock

**Files:**
- Create: `src/lib/stock/queries.ts`
- Test: `src/lib/stock/queries.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// src/lib/stock/queries.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { cerrarRemanenteSemi, listStockSemiVivo } from "./queries";

describe("stock queries", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_partidas_stock, malaga.d_productos, malaga.usuarios RESTART IDENTITY CASCADE"
    );
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("cerrar el remanente de una partida SEMI la saca del stock vivo", async () => {
    const userBaja = await seedUser();
    const semi = await createProducto({ detalle: "Pasta gianduia", unidMed: "kg", tipoProducto: "SEMI" });

    const partida = await query<{ id_partistock: number }>(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
       VALUES ($1, 0.3, '2026-08-01', 'SEMI-L1') RETURNING id_partistock`,
      [semi.idProd]
    );
    const idPartida = partida.rows[0].id_partistock;

    let vivo = await listStockSemiVivo();
    expect(vivo.map((v) => v.idPartida)).toContain(idPartida);

    await cerrarRemanenteSemi(idPartida, "scrap", userBaja);

    vivo = await listStockSemiVivo();
    expect(vivo.map((v) => v.idPartida)).not.toContain(idPartida);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test:db -- run src/lib/stock/queries.test.ts`
Expected: FAIL con `Cannot find module './queries'`

- [ ] **Step 3: Implementar**

```typescript
// src/lib/stock/queries.ts
import { query } from "../db";

export interface StockPtVivo {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidad: string;
  lote: string;
  fechaFab: string;
}

export async function listStockPtVivo(): Promise<StockPtVivo[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    producto_detalle: string;
    cantidad: string;
    lote: string;
    fecha_fab: string;
  }>(
    `SELECT v.id_partistock, v.id_prod, p.detalle AS producto_detalle, v.cantidad, v.lote, v.fecha_fab
     FROM malaga.v_stock_pt_vivo v
     JOIN malaga.d_productos p ON p.id_prod = v.id_prod
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    cantidad: r.cantidad,
    lote: r.lote,
    fechaFab: r.fecha_fab,
  }));
}

export interface StockSemiVivo {
  idPartida: number;
  idProd: number;
  productoDetalle: string;
  cantidadInicial: string;
  restante: string;
  lote: string;
}

export async function listStockSemiVivo(): Promise<StockSemiVivo[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    producto_detalle: string;
    cantidad_inicial: string;
    restante: string;
    lote: string;
  }>(
    `SELECT v.id_partistock, v.id_prod, p.detalle AS producto_detalle, v.cantidad_inicial, v.restante, v.lote
     FROM malaga.v_stock_semi_vivo v
     JOIN malaga.d_productos p ON p.id_prod = v.id_prod
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    cantidadInicial: r.cantidad_inicial,
    restante: r.restante,
    lote: r.lote,
  }));
}

export type MotivoBaja = "scrap" | "vencido" | "ajuste";

export async function cerrarRemanenteSemi(
  idPartida: number,
  motivo: MotivoBaja,
  userBaja: number
): Promise<void> {
  await query(
    `UPDATE malaga.f_partidas_stock
     SET ts_baja_manual = now(), motivo_baja_manual = $2, user_baja_manual = $3
     WHERE id_partistock = $1`,
    [idPartida, motivo, userBaja]
  );
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test:db -- run src/lib/stock/queries.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/stock/
git commit -m "feat: add stock data module (list PT/SEMI vivo, cerrar remanente SEMI)"
```

---

### Task 5: UI — Stock (PT y SEMI, con cierre de remanente)

**Files:**
- Create: `src/app/(app)/stock/page.tsx`
- Create: `src/app/(app)/stock/actions.ts`
- Modify: `src/app/(app)/layout.tsx` (agregar link "Stock")

- [ ] **Step 1: Server action de cierre de remanente**

```typescript
// src/app/(app)/stock/actions.ts
"use server";

import { requireRole } from "@/lib/auth/requireRole";
import { cerrarRemanenteSemi, type MotivoBaja } from "@/lib/stock/queries";
import { revalidatePath } from "next/cache";

export async function cerrarRemanenteAction(formData: FormData) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const motivo = String(formData.get("motivo") ?? "") as MotivoBaja;

  if (!idPartida || !["scrap", "vencido", "ajuste"].includes(motivo)) {
    return;
  }

  await cerrarRemanenteSemi(idPartida, motivo, user.idUser);
  revalidatePath("/stock");
}
```

- [ ] **Step 2: Página**

```tsx
// src/app/(app)/stock/page.tsx
import { listStockPtVivo, listStockSemiVivo } from "@/lib/stock/queries";
import { cerrarRemanenteAction } from "./actions";

export default async function StockPage() {
  const [pt, semi] = await Promise.all([listStockPtVivo(), listStockSemiVivo()]);

  return (
    <div className="p-10">
      <h1 className="mb-8 text-2xl font-semibold text-ink">Stock</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold text-ink">Producto terminado — vigente</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3">Fecha fab.</th>
              </tr>
            </thead>
            <tbody>
              {pt.map((p) => (
                <tr key={p.idPartida} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{p.productoDetalle}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{p.lote}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-soft">{p.cantidad}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.fechaFab}</td>
                </tr>
              ))}
              {pt.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                    Sin stock de PT en vitrina todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Semielaborados — restante</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3 text-right">Inicial</th>
                <th className="px-4 py-3 text-right">Restante</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {semi.map((s) => (
                <tr key={s.idPartida} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{s.productoDetalle}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{s.lote}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-soft">{s.cantidadInicial}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-soft">{s.restante}</td>
                  <td className="px-4 py-3">
                    <form action={cerrarRemanenteAction} className="flex items-center gap-2">
                      <input type="hidden" name="idPartida" value={s.idPartida} />
                      <select
                        name="motivo"
                        className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs"
                        defaultValue="scrap"
                      >
                        <option value="scrap">Scrap</option>
                        <option value="vencido">Vencido</option>
                        <option value="ajuste">Ajuste</option>
                      </select>
                      <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                        Cerrar remanente
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {semi.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                    Sin stock de semielaborados todavía.
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

- [ ] **Step 3: Agregar el link al sidebar**

En `src/app/(app)/layout.tsx`, agregar el link "Stock" junto a los demás.

- [ ] **Step 4: Verificar en el navegador**

Ir a `/stock`, confirmar que se ve el semielaborado con su restante (después de haber finalizado la OP de la Task 3, el consumo debería reflejarse acá). Probar "Cerrar remanente" con motivo scrap y confirmar que la fila desaparece del stock vivo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/stock" "src/app/(app)/layout.tsx"
git commit -m "feat: add stock page with PT/SEMI vivo lists and scrap action"
```

---

## Self-Review

**1. Cobertura del spec:**
- "Una OP = una partida" (sección 7) → `finalizarOrden` inserta exactamente una fila en `f_partidas_stock` con `id_op_origen`; el `UNIQUE` de la Fase 1 lo garantiza a nivel DB, y el chequeo de `estado` en la transacción lo garantiza a nivel aplicación (test: "rechaza finalizar una OP que ya está finalizada").
- "PT normalmente al peso_estandar" (sección 7) → la cantidad planificada se autocompleta con `peso_estandar` al elegir el producto en el alta de OP.
- Trazabilidad (módulo 4, sección 6) → cada consumo queda en `f_trazabilidad_op` con `id_parti_subprod` apuntando a la partida física específica.
- "La carga de consumos nunca bloquea por falta de stock" (sección 7) → ningún chequeo de `cantSubprod <= restante` en `finalizarOrden`; test dedicado que prueba consumir más de lo disponible sin que falle.
- Cierre de remanente SEMI como scrap, "flujo normal y esperado" (sección 7) → Task 4-5.

**2. Placeholders:** ninguno.

**3. Consistencia de tipos:** `OrdenParaFinalizar`/`RecetaItemParaFinalizar` se definen una sola vez en `src/lib/ordenes/queries.ts` y se reusan en `FinalizarForm.tsx` sin redefinir. `MotivoBaja` se define en `src/lib/stock/queries.ts` y se reusa en `src/app/(app)/stock/actions.ts`.

**Fuera de esta fase:** asignar una partida PT a un slot de exhibidora ("dar de baja a exhibición" — necesita la UI de cartilla, que es la Fase 5), cancelar una OP, editar una OP planificada antes de finalizarla, reportes de mermas/consumo real vs. teórico.

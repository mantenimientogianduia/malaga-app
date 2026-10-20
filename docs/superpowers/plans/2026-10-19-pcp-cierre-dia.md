# PCP: cierre del día Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la pestaña "Plan" de `/pcp` por un flujo de cierre del día donde el usuario confirma el stock de bachas y de bases, y el sistema entrega tres listas para mañana: qué fabricar (bachas), qué descongelar y qué cocinar (bases).

**Architecture:** Toda la matemática vive en funciones puras (`src/lib/pcp/cierre-calc.ts`) que se usan tanto en el navegador (cálculo en vivo) como en el servidor (recálculo al confirmar, para no confiar en cifras del cliente). Las consultas a la base están en `src/lib/pcp/cierre-queries.ts`. La pantalla es un único formulario cliente con cuatro bloques; al confirmar, una transacción da de baja bachas ausentes, crea las OPs de fabricación y de cocción y guarda el cierre completo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Postgres con SQL crudo (`src/lib/db.ts`), node-pg-migrate, vitest (`npm run test:db`), `useActionState`.

**Spec:** `docs/superpowers/specs/2026-10-19-pcp-cierre-dia-design.md`

---

## Contexto para quien implemente

- **Base de datos:** `npm run test:db` corre contra la base compartida (todavía no tiene datos reales; el dueño del proyecto autorizó correr la suite completa libremente). Cada corrida completa vacía productos, recetas, exhibidora y partidas: para volver a tener catálogo hay que correr los scripts de importación (Task 11).
- **Tests de este plan:** usan SIEMPRE el usuario de prueba `cierre@t.com`. Se limpia en `afterEach` borrando primero las tablas que lo referencian. **Nunca** `TRUNCATE` de `malaga.usuarios`.
- **Trabajo ajeno sin commitear:** puede haber cambios sin commitear de otra sesión en el working tree (por ejemplo `src/lib/temperaturas/*`, `src/app/(app)/auditoria/page.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/temperaturas/page.tsx`). No los toques ni los commitees: agregá siempre archivos por nombre (`git add <ruta>`), nunca `git add -A` ni `git commit -a`.
- **Next.js 16:** antes de escribir código de Next lee `node_modules/next/dist/docs/` si algo de las APIs no te cierra (hay cambios respecto de versiones anteriores).
- **Unidades:** `recetas_detalles.cant_subprod` es la cantidad de base de **una bacha estándar** del sabor. Por eso la explosión de recetas se hace por **bachas**, no por kg. No reutilices `calcularPlanManana` (multiplica por kg y sobreestima).
- **Comandos:** tests de un archivo: `npm run test:db -- src/lib/pcp/cierre-calc.test.ts`; suite completa: `npm run test:db`; migraciones: `npm run migrate:up`; lint: `npm run lint`; tipos: `npx tsc --noEmit`.
- **Estilo de UI:** reutilizá las clases que ya usa el módulo (`card`, `page-eyebrow`, `text-ink`, `text-ink-soft`, `bg-copper`, `bg-ok-tint`, `bg-warn-tint`, `bg-bad-tint`, `border-border`, `bg-surface-raised`).
- **Un patrón de React obligatorio:** el proyecto tiene la regla de ESLint `react-hooks/set-state-in-effect` como error. No uses `useEffect` para sincronizar estado; derivá valores durante el render (`useMemo`) o ajustá estado durante el render.

---

## File Structure

- **Create:** `migrations/1790900000000_create-pcp-cierre-dia.js` — tablas nuevas.
- **Create:** `src/lib/pcp/fechas.ts` + `src/lib/pcp/fechas.test.ts` — "hoy" y "mañana" en zona horaria de Málaga.
- **Create:** `src/lib/pcp/cierre-calc.ts` + `src/lib/pcp/cierre-calc.test.ts` — matemática pura (fabricar, descongelar, cocinar).
- **Create:** `src/lib/pcp/cierre-queries.ts` + `src/lib/pcp/cierre-queries.test.ts` — configuración, demanda base, datos del cierre, stock teórico, confirmación, plan del día.
- **Modify:** `src/lib/exhibidora/queries.ts` — `listPartidasEnObrador` debe excluir partidas dadas de baja.
- **Create:** `src/app/(app)/pcp/cierre-actions.ts` — server action de confirmación.
- **Create:** `src/app/(app)/pcp/config-actions.ts` — server actions de configuración y demanda base.
- **Create:** `src/app/(app)/pcp/CierreDiaForm.tsx` — pantalla de cierre (cliente).
- **Create:** `src/app/(app)/pcp/ConfigTab.tsx` — pestaña de configuración (servidor).
- **Create:** `src/app/(app)/pcp/PlanDelDiaTab.tsx` — pestaña de solo lectura (servidor).
- **Modify:** `src/app/(app)/pcp/PcpTabs.tsx`, `src/app/(app)/pcp/page.tsx`.
- **Delete:** `src/app/(app)/pcp/PlanRevisionForm.tsx`, `src/app/(app)/pcp/actions.ts` (quedan sin uso).

---

### Task 1: Migración con las tablas nuevas

**Files:**
- Create: `migrations/1790900000000_create-pcp-cierre-dia.js`

- [ ] **Step 1: Escribir la migración**

```js
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.pcp_demanda_base (
      id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
      kg_dia NUMERIC(12,3) NOT NULL CHECK (kg_dia >= 0)
    );

    CREATE TABLE malaga.pcp_config (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      margen_pct NUMERIC(6,2) NOT NULL DEFAULT 20 CHECK (margen_pct >= 0),
      dias_cobertura NUMERIC(6,2) NOT NULL DEFAULT 3 CHECK (dias_cobertura >= 0)
    );

    INSERT INTO malaga.pcp_config (id) VALUES (1);

    CREATE TABLE malaga.f_cierre_dia (
      id_cierre SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      fecha_plan DATE NOT NULL,
      ts_cierre TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_cierre INTEGER NOT NULL REFERENCES malaga.usuarios(id_user),
      margen_pct NUMERIC(6,2) NOT NULL,
      dias_cobertura NUMERIC(6,2) NOT NULL
    );

    CREATE TABLE malaga.f_cierre_dia_bacha (
      id_cierre INTEGER NOT NULL REFERENCES malaga.f_cierre_dia(id_cierre),
      id_partistock INTEGER NOT NULL REFERENCES malaga.f_partidas_stock(id_partistock),
      pct SMALLINT NOT NULL CHECK (pct IN (0, 25, 50, 75, 100)),
      PRIMARY KEY (id_cierre, id_partistock)
    );

    CREATE TABLE malaga.f_cierre_dia_sabor (
      id_cierre INTEGER NOT NULL REFERENCES malaga.f_cierre_dia(id_cierre),
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      demanda NUMERIC(12,3) NOT NULL,
      stock_disponible NUMERIC(12,3) NOT NULL,
      cocciones_pendientes NUMERIC(12,3) NOT NULL,
      necesario NUMERIC(12,3) NOT NULL,
      bachas INTEGER NOT NULL CHECK (bachas >= 0),
      kg_a_fabricar NUMERIC(12,3) NOT NULL,
      id_op_fabricar INTEGER REFERENCES malaga.f_ordenes_produccion(id_op),
      PRIMARY KEY (id_cierre, id_prod)
    );

    CREATE TABLE malaga.f_cierre_dia_base (
      id_cierre INTEGER NOT NULL REFERENCES malaga.f_cierre_dia(id_cierre),
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      stock_teorico NUMERIC(12,3) NOT NULL,
      stock_real NUMERIC(12,3) NOT NULL CHECK (stock_real >= 0),
      descongelar NUMERIC(12,3) NOT NULL,
      faltante NUMERIC(12,3) NOT NULL,
      cocinar NUMERIC(12,3) NOT NULL,
      id_op_cocinar INTEGER REFERENCES malaga.f_ordenes_produccion(id_op),
      PRIMARY KEY (id_cierre, id_prod)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.f_cierre_dia_base;
    DROP TABLE malaga.f_cierre_dia_sabor;
    DROP TABLE malaga.f_cierre_dia_bacha;
    DROP TABLE malaga.f_cierre_dia;
    DROP TABLE malaga.pcp_config;
    DROP TABLE malaga.pcp_demanda_base;
  `);
};
```

- [ ] **Step 2: Aplicar la migración**

Run: `npm run migrate:up`
Expected: salida con `1790900000000_create-pcp-cierre-dia` aplicada y `Migrations complete!`, sin errores.

- [ ] **Step 3: Verificar que las tablas existen**

Creá un script temporal `scripts/_tmp-verify.ts`:

```ts
import { query } from "../src/lib/db";
(async () => {
  const r = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'malaga'
       AND table_name IN ('pcp_demanda_base','pcp_config','f_cierre_dia','f_cierre_dia_bacha','f_cierre_dia_sabor','f_cierre_dia_base')
     ORDER BY table_name`
  );
  const c = await query<{ margen_pct: string; dias_cobertura: string }>(`SELECT margen_pct, dias_cobertura FROM malaga.pcp_config WHERE id = 1`);
  console.log(r.rows.map((x) => x.table_name).join(","), JSON.stringify(c.rows[0]));
  process.exit(0);
})();
```

Run: `npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/_tmp-verify.ts`
Expected: las 6 tablas listadas y `{"margen_pct":"20.00","dias_cobertura":"3.00"}`. Después borrá el script (`rm scripts/_tmp-verify.ts`).

- [ ] **Step 4: Commit**

```bash
git add migrations/1790900000000_create-pcp-cierre-dia.js
git commit -m "feat: agregar tablas del cierre del dia de PCP"
```

---

### Task 2: Fechas "hoy" y "mañana" en zona horaria de Málaga

**Files:**
- Create: `src/lib/pcp/fechas.ts`
- Test: `src/lib/pcp/fechas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/pcp/fechas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fechaEnMalaga, sumarDias, mananaEnMalaga } from "./fechas";

describe("fechas en Málaga", () => {
  it("fechaEnMalaga usa la zona Europe/Madrid, no UTC", () => {
    // 22:30 UTC del 19/10 ya es 00:30 del 20/10 en Madrid (UTC+2 en octubre).
    expect(fechaEnMalaga(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-20");
    expect(fechaEnMalaga(new Date("2026-10-19T10:00:00Z"))).toBe("2026-10-19");
  });

  it("fechaEnMalaga respeta el horario de invierno (UTC+1)", () => {
    expect(fechaEnMalaga(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02");
    expect(fechaEnMalaga(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-01");
  });

  it("sumarDias cruza fin de mes y de año", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("mananaEnMalaga es el día siguiente a la fecha de Málaga", () => {
    expect(mananaEnMalaga(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-21");
    expect(mananaEnMalaga(new Date("2026-10-19T10:00:00Z"))).toBe("2026-10-20");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test:db -- src/lib/pcp/fechas.test.ts`
Expected: FAIL (no se puede importar `./fechas`).

- [ ] **Step 3: Implementar**

`src/lib/pcp/fechas.ts`:

```ts
const FORMATO_MALAGA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "en-CA" formatea como YYYY-MM-DD.
export function fechaEnMalaga(ahora: Date = new Date()): string {
  return FORMATO_MALAGA.format(ahora);
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function mananaEnMalaga(ahora: Date = new Date()): string {
  return sumarDias(fechaEnMalaga(ahora), 1);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test:db -- src/lib/pcp/fechas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/fechas.ts src/lib/pcp/fechas.test.ts
git commit -m "feat: agregar fechas hoy y manana en zona horaria de Malaga"
```

---

### Task 3: Cálculo puro de fabricar, descongelar y cocinar

**Files:**
- Create: `src/lib/pcp/cierre-calc.ts`
- Test: `src/lib/pcp/cierre-calc.test.ts`

Esta capa no importa nada del servidor (se usa también desde el navegador). Solo importa `calcularCantidadAPlanificar` de `./forecast` (pura), que redondea al lote óptimo, aplica el lote mínimo y devuelve 0 si lo necesario es ≤ 0.

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/pcp/cierre-calc.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  calcularFabricacion,
  calcularBases,
  calcularCierre,
  type SaborCierre,
  type BaseCierre,
} from "./cierre-calc";

function sabor(parcial: Partial<SaborCierre> = {}): SaborCierre {
  return {
    idProd: 1,
    detalle: "Vainilla",
    pesoEstandar: 4,
    demandaBaseKgDia: 10,
    coccionesPendientes: 0,
    items: [],
    ...parcial,
  };
}

function base(parcial: Partial<BaseCierre> = {}): BaseCierre {
  return {
    idProd: 100,
    detalle: "Base Media",
    stockReal: 0,
    coccionesPendientes: 0,
    loteOptimo: null,
    loteMinimo: null,
    ...parcial,
  };
}

describe("calcularFabricacion", () => {
  it("aplica margen, resta el stock disponible y redondea a bachas enteras", () => {
    const f = calcularFabricacion(sabor(), { kgObrador: 0, kgExhibidaPonderada: 3 }, 20);
    expect(f.demandaManana).toBeCloseTo(12, 5);
    expect(f.stockDisponible).toBeCloseTo(3, 5);
    expect(f.necesario).toBeCloseTo(9, 5);
    expect(f.bachas).toBe(3);
    expect(f.kgAFabricar).toBeCloseTo(12, 5);
  });

  it("suma el stock del obrador al de la bacha exhibida", () => {
    const f = calcularFabricacion(sabor(), { kgObrador: 4, kgExhibidaPonderada: 2 }, 20);
    expect(f.stockDisponible).toBeCloseTo(6, 5);
    expect(f.necesario).toBeCloseTo(6, 5);
    expect(f.bachas).toBe(2);
  });

  it("no fabrica si el stock cubre la demanda", () => {
    const f = calcularFabricacion(sabor(), { kgObrador: 20, kgExhibidaPonderada: 0 }, 20);
    expect(f.necesario).toBeLessThan(0);
    expect(f.bachas).toBe(0);
    expect(f.kgAFabricar).toBe(0);
  });

  it("no cuenta una bacha de más por error de punto flotante", () => {
    // 0.9 / 0.3 = 3.0000000000000004 en punto flotante: tiene que dar 3 bachas, no 4.
    const f = calcularFabricacion(
      sabor({ pesoEstandar: 0.3, demandaBaseKgDia: 0.9 }),
      { kgObrador: 0, kgExhibidaPonderada: 0 },
      0
    );
    expect(f.bachas).toBe(3);
  });

  it("descuenta las OPs de fabricación ya pendientes", () => {
    const f = calcularFabricacion(
      sabor({ coccionesPendientes: 4 }),
      { kgObrador: 0, kgExhibidaPonderada: 3 },
      20
    );
    expect(f.necesario).toBeCloseTo(5, 5);
    expect(f.bachas).toBe(2);
  });

  it("un sabor sin peso estándar no se planifica y queda marcado", () => {
    const f = calcularFabricacion(
      sabor({ pesoEstandar: null }),
      { kgObrador: 0, kgExhibidaPonderada: 0 },
      20
    );
    expect(f.sinPeso).toBe(true);
    expect(f.bachas).toBe(0);
    expect(f.kgAFabricar).toBe(0);
  });
});

describe("calcularBases", () => {
  const vainilla = sabor({ items: [{ idSubprod: 100, cantSubprod: 2 }] });

  it("descongela lo que consume la fabricación, hasta el stock real, y marca el faltante", () => {
    const filas = calcularBases({
      sabores: [vainilla],
      bachasMananaPorSabor: new Map([[1, 3]]),
      bases: [base({ stockReal: 5, loteOptimo: 10, loteMinimo: 20 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    const b = filas[0];
    expect(b.necesidadFabricacion).toBeCloseTo(6, 5);
    expect(b.descongelar).toBeCloseTo(5, 5);
    expect(b.faltante).toBeCloseTo(1, 5);
    expect(b.stockTrasManana).toBeCloseTo(0, 5);
    // consumo diario = 2 * 10 * 1.2 / 4 = 6; objetivo = 6 * 3 = 18
    expect(b.consumoDiario).toBeCloseTo(6, 5);
    expect(b.objetivo).toBeCloseTo(18, 5);
    // a reponer = 18 + 1 - 0 - 0 = 19 -> 2 lotes de 10 = 20
    expect(b.aReponer).toBeCloseTo(19, 5);
    expect(b.kgACocinar).toBeCloseTo(20, 5);
  });

  it("descuenta las cocciones pendientes antes de cocinar", () => {
    const filas = calcularBases({
      sabores: [vainilla],
      bachasMananaPorSabor: new Map([[1, 3]]),
      bases: [base({ stockReal: 5, coccionesPendientes: 5, loteOptimo: 10, loteMinimo: 20 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    // a reponer = 18 + 1 - 0 - 5 = 14 -> 2 lotes de 10 = 20
    expect(filas[0].aReponer).toBeCloseTo(14, 5);
    expect(filas[0].kgACocinar).toBeCloseTo(20, 5);
  });

  it("no cocina si el stock cubre el objetivo", () => {
    const filas = calcularBases({
      sabores: [vainilla],
      bachasMananaPorSabor: new Map([[1, 1]]),
      bases: [base({ stockReal: 100, loteOptimo: 10, loteMinimo: 20 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    expect(filas[0].kgACocinar).toBe(0);
    expect(filas[0].faltante).toBe(0);
  });

  it("respeta el lote mínimo cuando el redondeo al lote óptimo queda corto", () => {
    const filas = calcularBases({
      sabores: [sabor({ items: [{ idSubprod: 100, cantSubprod: 1 }] })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0, loteOptimo: 4, loteMinimo: 20 })],
      margenPct: 0,
      diasCobertura: 2,
    });
    // consumo = 1 * 10 / 4 = 2.5; objetivo = 5 -> 2 lotes de 4 = 8 -> mínimo 20
    expect(filas[0].aReponer).toBeCloseTo(5, 5);
    expect(filas[0].kgACocinar).toBeCloseTo(20, 5);
  });

  it("una base que ninguna receta usa no se descongela ni se cocina", () => {
    const filas = calcularBases({
      sabores: [vainilla],
      bachasMananaPorSabor: new Map([[1, 3]]),
      bases: [base({ idProd: 999, detalle: "Otra", stockReal: 7 })],
      margenPct: 20,
      diasCobertura: 3,
    });
    expect(filas[0].necesidadFabricacion).toBe(0);
    expect(filas[0].descongelar).toBe(0);
    expect(filas[0].kgACocinar).toBe(0);
  });
});

describe("calcularCierre", () => {
  const entradasBase = {
    margenPct: 20,
    diasCobertura: 3,
    sabores: [sabor({ items: [{ idSubprod: 100, cantSubprod: 2 }] })],
    stockSabores: { 1: { kgObrador: 0, kgExhibidaPonderada: 3 } },
    bases: [base({ stockReal: 5, loteOptimo: 10, loteMinimo: 20 })],
  };

  it("encadena fabricación -> descongelar -> cocinar", () => {
    const r = calcularCierre(entradasBase);
    expect(r.fabricacion[0].bachas).toBe(3);
    expect(r.bases[0].descongelar).toBeCloseTo(5, 5);
    expect(r.bases[0].kgACocinar).toBeCloseTo(20, 5);
  });

  it("si se editan las bachas, el descongelado y la cocción se recalculan", () => {
    const r = calcularCierre({ ...entradasBase, bachasOverride: { 1: 2 } });
    expect(r.fabricacion[0].bachas).toBe(2);
    expect(r.fabricacion[0].kgAFabricar).toBeCloseTo(8, 5);
    // necesidad = 2 * 2 = 4; descongelar 4; faltante 0; stock tras mañana 1
    expect(r.bases[0].descongelar).toBeCloseTo(4, 5);
    expect(r.bases[0].faltante).toBe(0);
    // a reponer = 18 + 0 - 1 - 0 = 17 -> 2 lotes de 10 = 20
    expect(r.bases[0].kgACocinar).toBeCloseTo(20, 5);
  });

  it("la cantidad a cocinar editada pisa la calculada", () => {
    const r = calcularCierre({ ...entradasBase, cocinarOverride: { 100: 30 } });
    expect(r.bases[0].kgACocinar).toBe(30);
  });

  it("las bachas ya pendientes cuentan para el descongelado de mañana", () => {
    const r = calcularCierre({
      ...entradasBase,
      sabores: [sabor({ coccionesPendientes: 4, items: [{ idSubprod: 100, cantSubprod: 2 }] })],
    });
    // necesario = 12 - 3 - 4 = 5 -> 2 bachas nuevas; más 1 pendiente (4 kg / 4) = 3 bachas
    expect(r.fabricacion[0].bachas).toBe(2);
    expect(r.bases[0].necesidadFabricacion).toBeCloseTo(6, 5);
  });

  it("un sabor sin datos de stock se trata como stock cero", () => {
    const r = calcularCierre({ ...entradasBase, stockSabores: {} });
    expect(r.fabricacion[0].stockDisponible).toBe(0);
    expect(r.fabricacion[0].bachas).toBe(3);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/pcp/cierre-calc.test.ts`
Expected: FAIL (no se puede importar `./cierre-calc`).

- [ ] **Step 3: Implementar**

`src/lib/pcp/cierre-calc.ts`:

```ts
import { calcularCantidadAPlanificar } from "./forecast";

export interface ItemBase {
  idSubprod: number;
  // Cantidad de base que lleva UNA bacha estándar del sabor.
  cantSubprod: number;
}

export interface SaborCierre {
  idProd: number;
  detalle: string;
  pesoEstandar: number | null;
  demandaBaseKgDia: number;
  // kg de OPs de fabricación de este sabor ya pendientes (planificada / en_proceso).
  coccionesPendientes: number;
  items: ItemBase[];
}

export interface StockSabor {
  kgObrador: number;
  kgExhibidaPonderada: number;
}

export interface BaseCierre {
  idProd: number;
  detalle: string;
  stockReal: number;
  coccionesPendientes: number;
  loteOptimo: number | null;
  loteMinimo: number | null;
}

export interface FilaFabricacion {
  idProd: number;
  detalle: string;
  pesoEstandar: number | null;
  sinPeso: boolean;
  demandaManana: number;
  stockDisponible: number;
  coccionesPendientes: number;
  necesario: number;
  bachas: number;
  kgAFabricar: number;
}

export interface FilaBase {
  idProd: number;
  detalle: string;
  stockReal: number;
  necesidadFabricacion: number;
  descongelar: number;
  faltante: number;
  consumoDiario: number;
  stockTrasManana: number;
  objetivo: number;
  coccionesPendientes: number;
  aReponer: number;
  kgACocinar: number;
}

const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

export function calcularFabricacion(
  sabor: SaborCierre,
  stock: StockSabor,
  margenPct: number
): FilaFabricacion {
  const demandaManana = redondear3(sabor.demandaBaseKgDia * (1 + margenPct / 100));
  const stockDisponible = redondear3(stock.kgObrador + stock.kgExhibidaPonderada);
  const necesario = redondear3(demandaManana - stockDisponible - sabor.coccionesPendientes);
  const peso = sabor.pesoEstandar;
  const sinPeso = !peso || peso <= 0;
  // El redondeo previo evita que 3.0000000000000004 cuente como 4 bachas.
  const bachas = sinPeso || necesario <= 0 ? 0 : Math.ceil(redondear3(necesario / (peso as number)));
  const kgAFabricar = sinPeso ? 0 : redondear3(bachas * (peso as number));
  return {
    idProd: sabor.idProd,
    detalle: sabor.detalle,
    pesoEstandar: sabor.pesoEstandar,
    sinPeso,
    demandaManana,
    stockDisponible,
    coccionesPendientes: sabor.coccionesPendientes,
    necesario,
    bachas,
    kgAFabricar,
  };
}

export function calcularBases(args: {
  sabores: SaborCierre[];
  // idProd del sabor -> bachas que se fabrican mañana (nuevas + ya pendientes).
  bachasMananaPorSabor: Map<number, number>;
  bases: BaseCierre[];
  margenPct: number;
  diasCobertura: number;
}): FilaBase[] {
  return args.bases.map((base) => {
    let necesidad = 0;
    let consumo = 0;
    for (const sabor of args.sabores) {
      const cantPorBacha = sabor.items
        .filter((i) => i.idSubprod === base.idProd)
        .reduce((acc, i) => acc + i.cantSubprod, 0);
      if (cantPorBacha === 0) continue;
      necesidad += cantPorBacha * (args.bachasMananaPorSabor.get(sabor.idProd) ?? 0);
      if (sabor.pesoEstandar && sabor.pesoEstandar > 0) {
        consumo += (cantPorBacha * sabor.demandaBaseKgDia * (1 + args.margenPct / 100)) / sabor.pesoEstandar;
      }
    }
    const necesidadFabricacion = redondear3(necesidad);
    const consumoDiario = redondear3(consumo);
    const descongelar = redondear3(Math.min(necesidadFabricacion, base.stockReal));
    const faltante = redondear3(Math.max(necesidadFabricacion - base.stockReal, 0));
    const stockTrasManana = redondear3(base.stockReal - descongelar);
    const objetivo = redondear3(consumoDiario * args.diasCobertura);
    const aReponer = redondear3(objetivo + faltante - stockTrasManana - base.coccionesPendientes);
    const kgACocinar = calcularCantidadAPlanificar({
      necesario: aReponer,
      loteOptimo: base.loteOptimo,
      loteMinimo: base.loteMinimo,
    });
    return {
      idProd: base.idProd,
      detalle: base.detalle,
      stockReal: base.stockReal,
      necesidadFabricacion,
      descongelar,
      faltante,
      consumoDiario,
      stockTrasManana,
      objetivo,
      coccionesPendientes: base.coccionesPendientes,
      aReponer,
      kgACocinar,
    };
  });
}

export interface EntradasCierre {
  margenPct: number;
  diasCobertura: number;
  sabores: SaborCierre[];
  stockSabores: Record<number, StockSabor>;
  bases: BaseCierre[];
  // idProd del sabor -> bachas editadas a mano.
  bachasOverride?: Record<number, number>;
  // idProd de la base -> kg a cocinar editados a mano.
  cocinarOverride?: Record<number, number>;
}

export interface ResultadoCierre {
  fabricacion: FilaFabricacion[];
  bases: FilaBase[];
}

export function calcularCierre(e: EntradasCierre): ResultadoCierre {
  const fabricacion = e.sabores.map((s) => {
    const calculada = calcularFabricacion(
      s,
      e.stockSabores[s.idProd] ?? { kgObrador: 0, kgExhibidaPonderada: 0 },
      e.margenPct
    );
    const bachasEditadas = e.bachasOverride?.[s.idProd];
    if (bachasEditadas === undefined || calculada.sinPeso) return calculada;
    return {
      ...calculada,
      bachas: bachasEditadas,
      kgAFabricar: redondear3(bachasEditadas * (s.pesoEstandar as number)),
    };
  });

  const bachasMananaPorSabor = new Map(
    fabricacion.map((f) => [
      f.idProd,
      f.bachas + (f.pesoEstandar && f.pesoEstandar > 0 ? f.coccionesPendientes / f.pesoEstandar : 0),
    ])
  );

  const bases = calcularBases({
    sabores: e.sabores,
    bachasMananaPorSabor,
    bases: e.bases,
    margenPct: e.margenPct,
    diasCobertura: e.diasCobertura,
  }).map((b) => {
    const editado = e.cocinarOverride?.[b.idProd];
    return editado === undefined ? b : { ...b, kgACocinar: editado };
  });

  return { fabricacion, bases };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/pcp/cierre-calc.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/cierre-calc.ts src/lib/pcp/cierre-calc.test.ts
git commit -m "feat: agregar calculo puro de fabricar, descongelar y cocinar"
```

---

### Task 4: Configuración y demanda base (consultas)

**Files:**
- Create: `src/lib/pcp/cierre-queries.ts`
- Test: `src/lib/pcp/cierre-queries.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Creá `src/lib/pcp/cierre-queries.test.ts` con este contenido inicial (los siguientes tasks agregan bloques `describe` al mismo archivo y amplían los imports):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import {
  getConfigPcp,
  updateConfigPcp,
  listDemandaBase,
  setDemandaBase,
} from "./cierre-queries";

// malaga.usuarios NO se trunca nunca: es la tabla real de cuentas. Se borra solo la
// fila de prueba, después de vaciar las tablas que la referencian.
async function limpiar() {
  await query(
    `TRUNCATE malaga.f_cierre_dia_base, malaga.f_cierre_dia_sabor, malaga.f_cierre_dia_bacha, malaga.f_cierre_dia,
              malaga.f_pcp_pronostico, malaga.pcp_demanda_base, malaga.f_trazabilidad_op, malaga.f_partidas_stock,
              malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_exhibidora,
              malaga.d_productos RESTART IDENTITY CASCADE`
  );
  await query(`DELETE FROM malaga.usuarios WHERE email = 'cierre@t.com'`);
  await query(`UPDATE malaga.pcp_config SET margen_pct = 20, dias_cobertura = 3 WHERE id = 1`);
}

describe("cierre queries — configuración y demanda base", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("getConfigPcp devuelve el margen y los días de cobertura", async () => {
    const config = await getConfigPcp();
    expect(config.margenPct).toBe(20);
    expect(config.diasCobertura).toBe(3);
  });

  it("updateConfigPcp actualiza el margen y los días de cobertura", async () => {
    await updateConfigPcp(15, 4);
    const config = await getConfigPcp();
    expect(config.margenPct).toBe(15);
    expect(config.diasCobertura).toBe(4);
  });

  it("listDemandaBase trae los sabores de cartilla y programados con 0 por defecto", async () => {
    const actual = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const futuro = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado)
       VALUES (1, $1, $2, '2099-01-01')`,
      [actual.idProd, futuro.idProd]
    );

    const filas = await listDemandaBase();
    expect(filas.map((f) => f.detalle)).toEqual(["Chocolate", "Vainilla"]);
    expect(filas.every((f) => f.kgDia === 0)).toBe(true);
  });

  it("setDemandaBase crea o actualiza los kg por día de un sabor", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [p.idProd]);

    await setDemandaBase(p.idProd, 12.5);
    expect((await listDemandaBase())[0].kgDia).toBe(12.5);

    await setDemandaBase(p.idProd, 8);
    expect((await listDemandaBase())[0].kgDia).toBe(8);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: FAIL (no se puede importar `./cierre-queries`).

- [ ] **Step 3: Implementar**

`src/lib/pcp/cierre-queries.ts`:

```ts
import { query } from "../db";

export interface ConfigPcp {
  margenPct: number;
  diasCobertura: number;
}

export async function getConfigPcp(): Promise<ConfigPcp> {
  const result = await query<{ margen_pct: string; dias_cobertura: string }>(
    `SELECT margen_pct, dias_cobertura FROM malaga.pcp_config WHERE id = 1`
  );
  const row = result.rows[0];
  return { margenPct: Number(row.margen_pct), diasCobertura: Number(row.dias_cobertura) };
}

export async function updateConfigPcp(margenPct: number, diasCobertura: number): Promise<void> {
  await query(`UPDATE malaga.pcp_config SET margen_pct = $1, dias_cobertura = $2 WHERE id = 1`, [
    margenPct,
    diasCobertura,
  ]);
}

export interface DemandaBaseFila {
  idProd: number;
  detalle: string;
  kgDia: number;
}

// Sabores en cartilla o programados a entrar, con sus kg/día (0 si todavía no se cargó).
export async function listDemandaBase(): Promise<DemandaBaseFila[]> {
  const result = await query<{ id_prod: number; detalle: string; kg_dia: string }>(
    `SELECT p.id_prod, p.detalle, COALESCE(d.kg_dia, 0) AS kg_dia
     FROM malaga.d_productos p
     LEFT JOIN malaga.pcp_demanda_base d ON d.id_prod = p.id_prod
     WHERE p.id_prod IN (
       SELECT id_prod FROM malaga.d_exhibidora
       UNION
       SELECT id_prod_fut FROM malaga.d_exhibidora WHERE id_prod_fut IS NOT NULL
     )
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, detalle: r.detalle, kgDia: Number(r.kg_dia) }));
}

export async function setDemandaBase(idProd: number, kgDia: number): Promise<void> {
  await query(
    `INSERT INTO malaga.pcp_demanda_base (id_prod, kg_dia) VALUES ($1, $2)
     ON CONFLICT (id_prod) DO UPDATE SET kg_dia = EXCLUDED.kg_dia`,
    [idProd, kgDia]
  );
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/cierre-queries.ts src/lib/pcp/cierre-queries.test.ts
git commit -m "feat: agregar configuracion y demanda base del cierre de PCP"
```

---

### Task 5: Datos del cierre (bachas, stock teórico de bases)

**Files:**
- Modify: `src/lib/pcp/cierre-queries.ts`
- Modify: `src/lib/exhibidora/queries.ts` (`listPartidasEnObrador`)
- Test: `src/lib/pcp/cierre-queries.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/pcp/cierre-queries.test.ts`, ampliá los imports:

```ts
import { createReceta } from "../recetas/queries";
import { listPartidasEnObrador } from "../exhibidora/queries";
import {
  getConfigPcp,
  updateConfigPcp,
  listDemandaBase,
  setDemandaBase,
  listBachasObrador,
  listBachasExhibidas,
  getStockTeoricoBases,
  getDatosCierre,
} from "./cierre-queries";
```

Y agregá estos helpers y bloque `describe` al final del archivo:

```ts
async function seedUser() {
  const r = await query<{ id_user: number }>(
    `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('cierre@t.com', 'x', 'admin') RETURNING id_user`
  );
  return r.rows[0].id_user;
}

async function crearPartidaPt(idProd: number, cantidad: number, lote: string) {
  const r = await query<{ id_partistock: number }>(
    `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
     VALUES ($1, $2, '2026-10-01', $3) RETURNING id_partistock`,
    [idProd, cantidad, lote]
  );
  return r.rows[0].id_partistock;
}

async function exhibir(idPartida: number, idExhibidora: number, idUser: number, tsExhibicion = "now()") {
  await query(
    `UPDATE malaga.f_partidas_stock
     SET ts_exhibicion = ${tsExhibicion}, id_exhibidora = $2, user_exhibicion = $3
     WHERE id_partistock = $1`,
    [idPartida, idExhibidora, idUser]
  );
}

describe("cierre queries — datos del cierre", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("listBachasObrador trae solo PT sin exhibir y sin baja", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const userId = await seedUser();
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
      [p.idProd]
    );
    const enObrador = await crearPartidaPt(p.idProd, 4, "L1");
    const exhibida = await crearPartidaPt(p.idProd, 4, "L2");
    const conBaja = await crearPartidaPt(p.idProd, 4, "L3");
    await exhibir(exhibida, exhib.rows[0].id_exhibidora, userId);
    await query(
      `UPDATE malaga.f_partidas_stock SET ts_baja_manual = now(), motivo_baja_manual = 'ajuste', user_baja_manual = $2 WHERE id_partistock = $1`,
      [conBaja, userId]
    );

    const bachas = await listBachasObrador();
    expect(bachas.map((b) => b.idPartida)).toEqual([enObrador]);
    expect(bachas[0].cantidad).toBe(4);
    expect(bachas[0].detalle).toBe("Vainilla");
  });

  it("listPartidasEnObrador (pantalla Exhibir) también excluye partidas dadas de baja", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const userId = await seedUser();
    const visible = await crearPartidaPt(p.idProd, 4, "L1");
    const conBaja = await crearPartidaPt(p.idProd, 4, "L2");
    await query(
      `UPDATE malaga.f_partidas_stock SET ts_baja_manual = now(), motivo_baja_manual = 'ajuste', user_baja_manual = $2 WHERE id_partistock = $1`,
      [conBaja, userId]
    );

    const partidas = await listPartidasEnObrador();
    expect(partidas.map((x) => x.idPartida)).toEqual([visible]);
  });

  it("listBachasExhibidas trae solo la última bacha exhibida de cada posición", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const userId = await seedUser();
    const exhib = await query<{ id_exhibidora: number }>(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (3, $1) RETURNING id_exhibidora`,
      [p.idProd]
    );
    const vieja = await crearPartidaPt(p.idProd, 4, "L1");
    const actual = await crearPartidaPt(p.idProd, 5, "L2");
    await exhibir(vieja, exhib.rows[0].id_exhibidora, userId, "now() - interval '2 days'");
    await exhibir(actual, exhib.rows[0].id_exhibidora, userId, "now()");

    const bachas = await listBachasExhibidas();
    expect(bachas).toHaveLength(1);
    expect(bachas[0].idPartida).toBe(actual);
    expect(bachas[0].cantidad).toBe(5);
    expect(bachas[0].nroPosicion).toBe(3);
  });

  it("getStockTeoricoBases sin cierre previo usa el stock por lotes", async () => {
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 7, '2026-10-01', 'B1')`,
      [semi.idProd]
    );
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 3, '2026-10-01', 'B2')`,
      [semi.idProd]
    );

    const bases = await getStockTeoricoBases();
    const fila = bases.find((b) => b.idProd === semi.idProd)!;
    expect(fila.stockTeorico).toBe(10);
  });

  it("getStockTeoricoBases con cierre previo = real + producido - consumido - bajas", async () => {
    const userId = await seedUser();
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 2 }], userAlta: userId });
    const receta = await query<{ id_receta: number; id_det_receta: number }>(
      `SELECT r.id_receta, rd.id_det_receta FROM malaga.recetas r
       JOIN malaga.recetas_detalles rd ON rd.id_receta = r.id_receta WHERE r.id_prod = $1`,
      [pt.idProd]
    );

    // Cierre anterior de hace 2 días: la base tenía 50 kg reales.
    const cierre = await query<{ id_cierre: number }>(
      `INSERT INTO malaga.f_cierre_dia (fecha, fecha_plan, ts_cierre, user_cierre, margen_pct, dias_cobertura)
       VALUES (CURRENT_DATE - 2, CURRENT_DATE - 1, now() - interval '2 days', $1, 20, 3) RETURNING id_cierre`,
      [userId]
    );
    await query(
      `INSERT INTO malaga.f_cierre_dia_base (id_cierre, id_prod, stock_teorico, stock_real, descongelar, faltante, cocinar)
       VALUES ($1, $2, 0, 50, 0, 0, 0)`,
      [cierre.rows[0].id_cierre, semi.idProd]
    );

    // Producido después del cierre: una cocción de 30 kg.
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote) VALUES ($1, 30, CURRENT_DATE, 'B-NUEVA')`,
      [semi.idProd]
    );
    // Consumido después del cierre: una OP de fabricación finalizada usó 12 kg (sin lote elegido).
    const op = await query<{ id_op: number }>(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado, ts_fin)
       VALUES ($1, $2, 4, CURRENT_DATE, 'finalizada', now() - interval '1 hour') RETURNING id_op`,
      [pt.idProd, receta.rows[0].id_receta]
    );
    await query(
      `INSERT INTO malaga.f_trazabilidad_op (id_op, id_receta, id_detalle_receta, id_subprod, cant_subprod, id_parti_subprod, id_prod_op)
       VALUES ($1, $2, $3, $4, 12, NULL, $5)`,
      [op.rows[0].id_op, receta.rows[0].id_receta, receta.rows[0].id_det_receta, semi.idProd, pt.idProd]
    );
    // Baja manual después del cierre de un lote de 10 kg que existía antes.
    await query(
      `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_ingreso, ts_baja_manual, motivo_baja_manual, user_baja_manual)
       VALUES ($1, 10, CURRENT_DATE - 5, 'B-VIEJA', now() - interval '3 days', now(), 'vencido', $2)`,
      [semi.idProd, userId]
    );

    const bases = await getStockTeoricoBases();
    const fila = bases.find((b) => b.idProd === semi.idProd)!;
    expect(fila.stockTeorico).toBe(58); // 50 + 30 - 12 - 10
  });

  it("getDatosCierre arma sabores, bachas y bases para la pantalla", async () => {
    const userId = await seedUser();
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
    await query(`UPDATE malaga.d_productos SET lote_optimo = 10, lote_minimo = 20 WHERE id_prod = $1`, [semi.idProd]);
    await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 2 }], userAlta: userId });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [pt.idProd]);
    await setDemandaBase(pt.idProd, 10);
    await query(
      `INSERT INTO malaga.f_ordenes_produccion (id_prod, cant_plan, fecha_plan, estado) VALUES ($1, 8, CURRENT_DATE, 'planificada')`,
      [pt.idProd]
    );

    const datos = await getDatosCierre();
    expect(datos.margenPct).toBe(20);
    expect(datos.diasCobertura).toBe(3);
    expect(datos.sabores).toHaveLength(1);
    expect(datos.sabores[0]).toMatchObject({
      idProd: pt.idProd,
      detalle: "Vainilla",
      pesoEstandar: 4,
      demandaBaseKgDia: 10,
      coccionesPendientes: 8,
    });
    expect(datos.sabores[0].items).toEqual([{ idSubprod: semi.idProd, cantSubprod: 2 }]);
    expect(datos.bases).toHaveLength(1);
    expect(datos.bases[0]).toMatchObject({
      idProd: semi.idProd,
      detalle: "Base Media",
      stockTeorico: 0,
      coccionesPendientes: 0,
      loteOptimo: 10,
      loteMinimo: 20,
    });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: FAIL (las funciones nuevas no existen; además el test de `listPartidasEnObrador` falla porque hoy incluye partidas con baja).

- [ ] **Step 3: Arreglar `listPartidasEnObrador`**

En `src/lib/exhibidora/queries.ts`, dentro de `listPartidasEnObrador`, cambiá el `WHERE`:

```ts
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL AND ps.ts_baja_manual IS NULL
```

(antes era `WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL`).

- [ ] **Step 4: Implementar las consultas nuevas**

En `src/lib/pcp/cierre-queries.ts`, cambiá el import de arriba y agregá al final:

```ts
import { query } from "../db";
import {
  getCoccionesPendientesPorProducto,
  getItemsRecetaSemiPorProducto,
} from "./queries";
import type { SaborCierre } from "./cierre-calc";
```

```ts
export interface BachaObrador {
  idPartida: number;
  idProd: number;
  detalle: string;
  lote: string;
  cantidad: number;
}

// Bachas de PT terminadas que todavía no salieron a la exhibidora (y no tienen baja).
export async function listBachasObrador(): Promise<BachaObrador[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    detalle: string;
    lote: string;
    cantidad: string;
  }>(
    `SELECT ps.id_partistock, ps.id_prod, p.detalle, ps.lote, ps.cantidad
     FROM malaga.f_partidas_stock ps
     JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
     WHERE p.tipo_producto = 'PT' AND ps.ts_exhibicion IS NULL AND ps.ts_baja_manual IS NULL
     ORDER BY p.detalle, ps.fecha_fab, ps.id_partistock`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    detalle: r.detalle,
    lote: r.lote,
    cantidad: Number(r.cantidad),
  }));
}

export interface BachaExhibida {
  idPartida: number;
  idProd: number;
  detalle: string;
  lote: string;
  cantidad: number;
  nroPosicion: number;
}

// La bacha actualmente exhibida en cada posición (la última partida exhibida del slot).
export async function listBachasExhibidas(): Promise<BachaExhibida[]> {
  const result = await query<{
    id_partistock: number;
    id_prod: number;
    detalle: string;
    lote: string;
    cantidad: string;
    nro: number;
  }>(
    `SELECT v.id_partistock, v.id_prod, p.detalle, v.lote, v.cantidad, e.nro
     FROM malaga.v_stock_pt_vivo v
     JOIN malaga.d_productos p ON p.id_prod = v.id_prod
     JOIN malaga.d_exhibidora e ON e.id_exhibidora = v.id_exhibidora
     ORDER BY e.nro`
  );
  return result.rows.map((r) => ({
    idPartida: r.id_partistock,
    idProd: r.id_prod,
    detalle: r.detalle,
    lote: r.lote,
    cantidad: Number(r.cantidad),
    nroPosicion: r.nro,
  }));
}

export interface BaseTeorica {
  idProd: number;
  detalle: string;
  loteOptimo: number | null;
  loteMinimo: number | null;
  stockTeorico: number;
}

// Stock teórico de cada base activa (SEMI).
// Con cierre previo: real del último cierre + producido - consumido - bajas desde entonces.
// Sin cierre previo: suma del restante por lotes (v_stock_semi_vivo).
// El consumo se toma de f_trazabilidad_op por base (id_subprod) y no por lote, porque
// una OP puede finalizarse sin haber elegido el lote consumido.
export async function getStockTeoricoBases(): Promise<BaseTeorica[]> {
  const result = await query<{
    id_prod: number;
    detalle: string;
    lote_optimo: string | null;
    lote_minimo: string | null;
    teorico: string;
  }>(
    `WITH ultimo AS (
       SELECT DISTINCT ON (b.id_prod) b.id_prod, b.stock_real, c.ts_cierre
       FROM malaga.f_cierre_dia_base b
       JOIN malaga.f_cierre_dia c ON c.id_cierre = b.id_cierre
       ORDER BY b.id_prod, c.ts_cierre DESC, c.id_cierre DESC
     )
     SELECT p.id_prod, p.detalle, p.lote_optimo, p.lote_minimo,
       CASE WHEN u.id_prod IS NULL THEN
         COALESCE((SELECT SUM(v.restante) FROM malaga.v_stock_semi_vivo v WHERE v.id_prod = p.id_prod), 0)
       ELSE
         u.stock_real
         + COALESCE((
             SELECT SUM(ps.cantidad) FROM malaga.f_partidas_stock ps
             WHERE ps.id_prod = p.id_prod AND ps.ts_ingreso > u.ts_cierre
           ), 0)
         - COALESCE((
             SELECT SUM(t.cant_subprod)
             FROM malaga.f_trazabilidad_op t
             JOIN malaga.f_ordenes_produccion o ON o.id_op = t.id_op
             WHERE t.id_subprod = p.id_prod AND o.ts_fin > u.ts_cierre
           ), 0)
         - COALESCE((
             SELECT SUM(ps.cantidad - COALESCE(cons.total, 0))
             FROM malaga.f_partidas_stock ps
             LEFT JOIN (
               SELECT id_parti_subprod, SUM(cant_subprod) AS total
               FROM malaga.f_trazabilidad_op
               WHERE id_parti_subprod IS NOT NULL
               GROUP BY id_parti_subprod
             ) cons ON cons.id_parti_subprod = ps.id_partistock
             WHERE ps.id_prod = p.id_prod AND ps.ts_baja_manual > u.ts_cierre
           ), 0)
       END AS teorico
     FROM malaga.d_productos p
     LEFT JOIN ultimo u ON u.id_prod = p.id_prod
     WHERE p.tipo_producto = 'SEMI' AND p.activo = true
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    loteOptimo: r.lote_optimo === null ? null : Number(r.lote_optimo),
    loteMinimo: r.lote_minimo === null ? null : Number(r.lote_minimo),
    stockTeorico: Number(r.teorico),
  }));
}

export interface BaseDatos extends BaseTeorica {
  coccionesPendientes: number;
}

export interface DatosCierre {
  margenPct: number;
  diasCobertura: number;
  sabores: SaborCierre[];
  bachasObrador: BachaObrador[];
  bachasExhibidas: BachaExhibida[];
  bases: BaseDatos[];
}

// Todo lo que necesita la pantalla de cierre. Es serializable (se pasa a un componente cliente).
export async function getDatosCierre(): Promise<DatosCierre> {
  const config = await getConfigPcp();
  const demanda = await listDemandaBase();
  const idsSabores = demanda.map((d) => d.idProd);

  const pesosResult = await query<{ id_prod: number; peso_estandar: string | null }>(
    `SELECT id_prod, peso_estandar FROM malaga.d_productos WHERE id_prod = ANY($1::int[])`,
    [idsSabores]
  );
  const pesos = new Map(
    pesosResult.rows.map((r) => [r.id_prod, r.peso_estandar === null ? null : Number(r.peso_estandar)])
  );

  const itemsPorSabor = await getItemsRecetaSemiPorProducto(idsSabores);
  const pendientes = await getCoccionesPendientesPorProducto();
  const bachasObrador = await listBachasObrador();
  const bachasExhibidas = await listBachasExhibidas();
  const bases = await getStockTeoricoBases();

  const sabores: SaborCierre[] = demanda.map((d) => ({
    idProd: d.idProd,
    detalle: d.detalle,
    pesoEstandar: pesos.get(d.idProd) ?? null,
    demandaBaseKgDia: d.kgDia,
    coccionesPendientes: pendientes.get(d.idProd) ?? 0,
    items: (itemsPorSabor.get(d.idProd) ?? []).map((i) => ({
      idSubprod: i.idSubprod,
      cantSubprod: Number(i.cantSubprod),
    })),
  }));

  return {
    margenPct: config.margenPct,
    diasCobertura: config.diasCobertura,
    sabores,
    bachasObrador,
    bachasExhibidas,
    bases: bases.map((b) => ({ ...b, coccionesPendientes: pendientes.get(b.idProd) ?? 0 })),
  };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: PASS (10 tests).

Run también `npm run test:db -- src/lib/exhibidora/queries.test.ts` para confirmar que el cambio en `listPartidasEnObrador` no rompió nada.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pcp/cierre-queries.ts src/lib/pcp/cierre-queries.test.ts src/lib/exhibidora/queries.ts
git commit -m "feat: agregar consultas de bachas, stock teorico de bases y datos del cierre"
```

---

### Task 6: Confirmar el cierre

**Files:**
- Modify: `src/lib/pcp/cierre-queries.ts`
- Test: `src/lib/pcp/cierre-queries.test.ts`

`confirmarCierre` recalcula todo en el servidor con las mismas funciones puras. Del cliente solo toma las decisiones del usuario: bachas ausentes, % de cada bacha exhibida, stock real de cada base y las ediciones manuales.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/pcp/cierre-queries.test.ts`, agregá `confirmarCierre` y `type ConfirmarCierreInput` al import de `./cierre-queries` y este bloque al final:

```ts
async function escenarioBasico() {
  const userId = await seedUser();
  const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
  const semi = await createProducto({ detalle: "Base Media", unidMed: "kg", tipoProducto: "SEMI" });
  await query(`UPDATE malaga.d_productos SET lote_optimo = 10, lote_minimo = 20 WHERE id_prod = $1`, [semi.idProd]);
  await createReceta({ idProd: pt.idProd, items: [{ idSubprod: semi.idProd, cantSubprod: 2 }], userAlta: userId });
  const exhib = await query<{ id_exhibidora: number }>(
    `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
    [pt.idProd]
  );
  await setDemandaBase(pt.idProd, 10);
  const exhibida = await crearPartidaPt(pt.idProd, 4, "EXH");
  await exhibir(exhibida, exhib.rows[0].id_exhibidora, userId);
  const obrador = await crearPartidaPt(pt.idProd, 4, "OBR");
  return { userId, pt, semi, exhibida, obrador };
}

function entradaCierre(
  e: Awaited<ReturnType<typeof escenarioBasico>>,
  parcial: Partial<ConfirmarCierreInput> = {}
): ConfirmarCierreInput {
  return {
    fecha: "2030-01-01",
    fechaPlan: "2030-01-02",
    userCierre: e.userId,
    ausentes: [],
    pctBachas: [{ idPartida: e.exhibida, pct: 50 }],
    stockReal: { [e.semi.idProd]: 3 },
    bachasOverride: {},
    cocinarOverride: {},
    ...parcial,
  };
}

describe("cierre queries — confirmar cierre", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("crea las OPs de fabricación y de cocción y guarda el cierre completo", async () => {
    const e = await escenarioBasico();

    const r = await confirmarCierre(entradaCierre(e));

    // demanda 12; stock = 4 (obrador) + 2 (50% de 4) = 6; necesario 6 -> 2 bachas = 8 kg
    // base: necesidad 2*2 = 4; real 3 -> descongelar 3, faltante 1; consumo diario 2*10*1.2/4 = 6;
    // objetivo 18; a reponer 18 + 1 - 0 = 19 -> 2 lotes de 10 = 20
    expect(r.opsFabricacion).toHaveLength(1);
    expect(r.opsCoccion).toHaveLength(1);

    const opPt = await query<{ cant_plan: string; fecha_plan: string; estado: string }>(
      `SELECT cant_plan, fecha_plan::text, estado FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsFabricacion[0]]
    );
    expect(Number(opPt.rows[0].cant_plan)).toBe(8);
    expect(opPt.rows[0].fecha_plan).toBe("2030-01-02");
    expect(opPt.rows[0].estado).toBe("planificada");

    const opSemi = await query<{ cant_plan: string }>(
      `SELECT cant_plan FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsCoccion[0]]
    );
    expect(Number(opSemi.rows[0].cant_plan)).toBe(20);

    const cierre = await query<{ fecha_plan: string; margen_pct: string; dias_cobertura: string }>(
      `SELECT fecha_plan::text, margen_pct, dias_cobertura FROM malaga.f_cierre_dia WHERE id_cierre = $1`,
      [r.idCierre]
    );
    expect(cierre.rows[0].fecha_plan).toBe("2030-01-02");
    expect(Number(cierre.rows[0].margen_pct)).toBe(20);

    const bacha = await query<{ pct: number }>(
      `SELECT pct FROM malaga.f_cierre_dia_bacha WHERE id_cierre = $1 AND id_partistock = $2`,
      [r.idCierre, e.exhibida]
    );
    expect(bacha.rows[0].pct).toBe(50);

    const sabor = await query<{ bachas: number; kg_a_fabricar: string; id_op_fabricar: number }>(
      `SELECT bachas, kg_a_fabricar, id_op_fabricar FROM malaga.f_cierre_dia_sabor WHERE id_cierre = $1`,
      [r.idCierre]
    );
    expect(sabor.rows[0].bachas).toBe(2);
    expect(Number(sabor.rows[0].kg_a_fabricar)).toBe(8);
    expect(sabor.rows[0].id_op_fabricar).toBe(r.opsFabricacion[0]);

    const base = await query<{
      stock_teorico: string;
      stock_real: string;
      descongelar: string;
      faltante: string;
      cocinar: string;
      id_op_cocinar: number;
    }>(
      `SELECT stock_teorico, stock_real, descongelar, faltante, cocinar, id_op_cocinar
       FROM malaga.f_cierre_dia_base WHERE id_cierre = $1`,
      [r.idCierre]
    );
    expect(Number(base.rows[0].stock_teorico)).toBe(0);
    expect(Number(base.rows[0].stock_real)).toBe(3);
    expect(Number(base.rows[0].descongelar)).toBe(3);
    expect(Number(base.rows[0].faltante)).toBe(1);
    expect(Number(base.rows[0].cocinar)).toBe(20);
    expect(base.rows[0].id_op_cocinar).toBe(r.opsCoccion[0]);

    const snapshot = await query(`SELECT 1 FROM malaga.f_pcp_pronostico WHERE fecha_plan = '2030-01-02'`);
    expect(snapshot.rows).toHaveLength(2); // una fila por el sabor y otra por la base
  });

  it("las bachas del obrador destildadas quedan con baja por ajuste y no cuentan como stock", async () => {
    const e = await escenarioBasico();

    const r = await confirmarCierre(entradaCierre(e, { ausentes: [e.obrador] }));

    const baja = await query<{ motivo_baja_manual: string; user_baja_manual: number }>(
      `SELECT motivo_baja_manual, user_baja_manual FROM malaga.f_partidas_stock WHERE id_partistock = $1`,
      [e.obrador]
    );
    expect(baja.rows[0].motivo_baja_manual).toBe("ajuste");
    expect(baja.rows[0].user_baja_manual).toBe(e.userId);

    // stock = 2 (solo 50% de la exhibida); necesario 10 -> 3 bachas = 12 kg
    const op = await query<{ cant_plan: string }>(
      `SELECT cant_plan FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsFabricacion[0]]
    );
    expect(Number(op.rows[0].cant_plan)).toBe(12);
  });

  it("repetir el cierre el mismo día no duplica OPs y mantiene el descongelado", async () => {
    const e = await escenarioBasico();
    await confirmarCierre(entradaCierre(e));

    const segundo = await confirmarCierre(entradaCierre(e));

    expect(segundo.opsFabricacion).toHaveLength(0);
    expect(segundo.opsCoccion).toHaveLength(0);
    const base = await query<{ descongelar: string; faltante: string }>(
      `SELECT descongelar, faltante FROM malaga.f_cierre_dia_base WHERE id_cierre = $1`,
      [segundo.idCierre]
    );
    expect(Number(base.rows[0].descongelar)).toBe(3);
    expect(Number(base.rows[0].faltante)).toBe(1);
    const total = await query<{ c: string }>(`SELECT count(*) AS c FROM malaga.f_ordenes_produccion`);
    expect(Number(total.rows[0].c)).toBe(2);
  });

  it("usa las bachas y la cocción editadas a mano", async () => {
    const e = await escenarioBasico();

    const r = await confirmarCierre(
      entradaCierre(e, { bachasOverride: { [e.pt.idProd]: 1 }, cocinarOverride: { [e.semi.idProd]: 30 } })
    );

    const opPt = await query<{ cant_plan: string }>(
      `SELECT cant_plan FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsFabricacion[0]]
    );
    expect(Number(opPt.rows[0].cant_plan)).toBe(4);
    const opSemi = await query<{ cant_plan: string }>(
      `SELECT cant_plan FROM malaga.f_ordenes_produccion WHERE id_op = $1`,
      [r.opsCoccion[0]]
    );
    expect(Number(opSemi.rows[0].cant_plan)).toBe(30);
  });

  it("rechaza el cierre si falta el % de una bacha exhibida", async () => {
    const e = await escenarioBasico();
    await expect(confirmarCierre(entradaCierre(e, { pctBachas: [] }))).rejects.toThrow(
      "Falta indicar el % de todas las bachas exhibidas."
    );
  });

  it("rechaza el cierre si falta el stock real de una base", async () => {
    const e = await escenarioBasico();
    await expect(confirmarCierre(entradaCierre(e, { stockReal: {} }))).rejects.toThrow(
      "Falta cargar el stock real de todas las bases."
    );
  });

  it("rechaza porcentajes fuera de 0, 25, 50, 75 y 100", async () => {
    const e = await escenarioBasico();
    await expect(
      confirmarCierre(entradaCierre(e, { pctBachas: [{ idPartida: e.exhibida, pct: 30 }] }))
    ).rejects.toThrow("El % de cada bacha debe ser 0, 25, 50, 75 o 100.");
  });

  it("no deja ningún cambio si algo falla a mitad del cierre", async () => {
    const e = await escenarioBasico();
    await expect(confirmarCierre(entradaCierre(e, { pctBachas: [] }))).rejects.toThrow();
    const cierres = await query<{ c: string }>(`SELECT count(*) AS c FROM malaga.f_cierre_dia`);
    const ops = await query<{ c: string }>(`SELECT count(*) AS c FROM malaga.f_ordenes_produccion`);
    expect(Number(cierres.rows[0].c)).toBe(0);
    expect(Number(ops.rows[0].c)).toBe(0);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts -t "confirmar cierre"`
Expected: FAIL (`confirmarCierre` no existe).

- [ ] **Step 3: Implementar `confirmarCierre`**

En `src/lib/pcp/cierre-queries.ts`, cambiá los imports de arriba por:

```ts
import { query, withTransaction } from "../db";
import {
  getCoccionesPendientesPorProducto,
  getItemsRecetaSemiPorProducto,
} from "./queries";
import { calcularCierre, type SaborCierre, type StockSabor } from "./cierre-calc";
```

(reemplaza el `import type { SaborCierre }` anterior) y agregá al final:

```ts
export interface ConfirmarCierreInput {
  fecha: string;
  fechaPlan: string;
  userCierre: number;
  // Bachas del obrador que el usuario destildó (no están físicamente).
  ausentes: number[];
  pctBachas: { idPartida: number; pct: number }[];
  stockReal: Record<number, number>;
  bachasOverride: Record<number, number>;
  cocinarOverride: Record<number, number>;
}

export interface ResultadoConfirmacion {
  idCierre: number;
  opsFabricacion: number[];
  opsCoccion: number[];
}

const PORCENTAJES_VALIDOS = [0, 25, 50, 75, 100];

type Client = import("pg").PoolClient;

async function crearOpPlanificada(
  client: Client,
  idProd: number,
  cantidad: number,
  fechaPlan: string
): Promise<number> {
  // Misma lógica que createOrdenProduccion (src/lib/ordenes/queries.ts), pero con el client de
  // esta transacción. Una OP sin receta activa se crea igual (al finalizarla no hay ingredientes).
  const receta = await client.query<{ id_receta: number }>(
    `SELECT id_receta FROM malaga.recetas WHERE id_prod = $1 AND activa = true`,
    [idProd]
  );
  const op = await client.query<{ id_op: number }>(
    `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado)
     VALUES ($1, $2, $3, $4, 'planificada') RETURNING id_op`,
    [idProd, receta.rows[0]?.id_receta ?? null, cantidad, fechaPlan]
  );
  return op.rows[0].id_op;
}

export async function confirmarCierre(input: ConfirmarCierreInput): Promise<ResultadoConfirmacion> {
  const datos = await getDatosCierre();

  const pctPorPartida = new Map(input.pctBachas.map((p) => [p.idPartida, p.pct]));
  if (datos.bachasExhibidas.some((b) => !pctPorPartida.has(b.idPartida))) {
    throw new Error("Falta indicar el % de todas las bachas exhibidas.");
  }
  if (input.pctBachas.some((p) => !PORCENTAJES_VALIDOS.includes(p.pct))) {
    throw new Error("El % de cada bacha debe ser 0, 25, 50, 75 o 100.");
  }
  if (datos.bases.some((b) => input.stockReal[b.idProd] === undefined)) {
    throw new Error("Falta cargar el stock real de todas las bases.");
  }
  if (Object.values(input.stockReal).some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error("El stock real de cada base debe ser un número mayor o igual a 0.");
  }
  if (Object.values(input.bachasOverride).some((v) => !Number.isInteger(v) || v < 0)) {
    throw new Error("Las bachas deben ser un número entero mayor o igual a 0.");
  }
  if (Object.values(input.cocinarOverride).some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error("Los kg a cocinar deben ser un número mayor o igual a 0.");
  }

  const idsObrador = new Set(datos.bachasObrador.map((b) => b.idPartida));
  const ausentes = new Set(input.ausentes.filter((id) => idsObrador.has(id)));

  const stockSabores: Record<number, StockSabor> = {};
  const stockDe = (idProd: number): StockSabor =>
    (stockSabores[idProd] ??= { kgObrador: 0, kgExhibidaPonderada: 0 });
  for (const b of datos.bachasObrador) {
    if (!ausentes.has(b.idPartida)) stockDe(b.idProd).kgObrador += b.cantidad;
  }
  for (const b of datos.bachasExhibidas) {
    stockDe(b.idProd).kgExhibidaPonderada += (b.cantidad * (pctPorPartida.get(b.idPartida) as number)) / 100;
  }

  const resultado = calcularCierre({
    margenPct: datos.margenPct,
    diasCobertura: datos.diasCobertura,
    sabores: datos.sabores,
    stockSabores,
    bases: datos.bases.map((b) => ({
      idProd: b.idProd,
      detalle: b.detalle,
      stockReal: input.stockReal[b.idProd],
      coccionesPendientes: b.coccionesPendientes,
      loteOptimo: b.loteOptimo,
      loteMinimo: b.loteMinimo,
    })),
    bachasOverride: input.bachasOverride,
    cocinarOverride: input.cocinarOverride,
  });
  const teoricoPorBase = new Map(datos.bases.map((b) => [b.idProd, b.stockTeorico]));

  return withTransaction(async (client) => {
    if (ausentes.size > 0) {
      await client.query(
        `UPDATE malaga.f_partidas_stock
         SET ts_baja_manual = now(), motivo_baja_manual = 'ajuste', user_baja_manual = $2
         WHERE id_partistock = ANY($1::int[]) AND ts_exhibicion IS NULL AND ts_baja_manual IS NULL`,
        [Array.from(ausentes), input.userCierre]
      );
    }

    const cierre = await client.query<{ id_cierre: number }>(
      `INSERT INTO malaga.f_cierre_dia (fecha, fecha_plan, user_cierre, margen_pct, dias_cobertura)
       VALUES ($1, $2, $3, $4, $5) RETURNING id_cierre`,
      [input.fecha, input.fechaPlan, input.userCierre, datos.margenPct, datos.diasCobertura]
    );
    const idCierre = cierre.rows[0].id_cierre;

    for (const b of datos.bachasExhibidas) {
      await client.query(
        `INSERT INTO malaga.f_cierre_dia_bacha (id_cierre, id_partistock, pct) VALUES ($1, $2, $3)`,
        [idCierre, b.idPartida, pctPorPartida.get(b.idPartida)]
      );
    }

    const opsFabricacion: number[] = [];
    for (const f of resultado.fabricacion) {
      const idOp = f.kgAFabricar > 0 ? await crearOpPlanificada(client, f.idProd, f.kgAFabricar, input.fechaPlan) : null;
      if (idOp !== null) opsFabricacion.push(idOp);

      await client.query(
        `INSERT INTO malaga.f_cierre_dia_sabor
           (id_cierre, id_prod, demanda, stock_disponible, cocciones_pendientes, necesario, bachas, kg_a_fabricar, id_op_fabricar)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [idCierre, f.idProd, f.demandaManana, f.stockDisponible, f.coccionesPendientes, f.necesario, f.bachas, f.kgAFabricar, idOp]
      );
      await client.query(
        `INSERT INTO malaga.f_pcp_pronostico
           (fecha_plan, id_prod, demanda_pronosticada, stock_actual_momento, stock_minimo_momento,
            cocciones_pendientes_momento, necesario, cantidad_planificada, id_op_generada, user_generado)
         VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)`,
        [input.fechaPlan, f.idProd, f.demandaManana, f.stockDisponible, f.coccionesPendientes, f.necesario, f.kgAFabricar, idOp, input.userCierre]
      );
    }

    const opsCoccion: number[] = [];
    for (const b of resultado.bases) {
      const idOp = b.kgACocinar > 0 ? await crearOpPlanificada(client, b.idProd, b.kgACocinar, input.fechaPlan) : null;
      if (idOp !== null) opsCoccion.push(idOp);

      await client.query(
        `INSERT INTO malaga.f_cierre_dia_base
           (id_cierre, id_prod, stock_teorico, stock_real, descongelar, faltante, cocinar, id_op_cocinar)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [idCierre, b.idProd, teoricoPorBase.get(b.idProd) ?? 0, b.stockReal, b.descongelar, b.faltante, b.kgACocinar, idOp]
      );
      await client.query(
        `INSERT INTO malaga.f_pcp_pronostico
           (fecha_plan, id_prod, demanda_pronosticada, stock_actual_momento, stock_minimo_momento,
            cocciones_pendientes_momento, necesario, cantidad_planificada, id_op_generada, user_generado)
         VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)`,
        [input.fechaPlan, b.idProd, b.necesidadFabricacion, b.stockReal, b.coccionesPendientes, b.aReponer, b.kgACocinar, idOp, input.userCierre]
      );
    }

    return { idCierre, opsFabricacion, opsCoccion };
  });
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: PASS (todos los tests del archivo, 18 en total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/cierre-queries.ts src/lib/pcp/cierre-queries.test.ts
git commit -m "feat: confirmar el cierre del dia creando OPs de fabricacion y coccion"
```

---

### Task 7: Plan del día

**Files:**
- Modify: `src/lib/pcp/cierre-queries.ts`
- Test: `src/lib/pcp/cierre-queries.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/pcp/cierre-queries.test.ts`, agregá `getPlanDelDia` al import de `./cierre-queries` y este bloque al final (usa `escenarioBasico` y `entradaCierre` definidos en el Task 6, en este mismo archivo):

```ts
describe("cierre queries — plan del día", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("sin cierre devuelve listas vacías", async () => {
    const plan = await getPlanDelDia("2030-01-02");
    expect(plan.cierre).toBeNull();
    expect(plan.fabricar).toEqual([]);
    expect(plan.cocinar).toEqual([]);
    expect(plan.descongelar).toEqual([]);
  });

  it("arma fabricar, cocinar y descongelar con las OPs de hoy y el último cierre", async () => {
    const e = await escenarioBasico();
    await confirmarCierre(entradaCierre(e));

    const plan = await getPlanDelDia("2030-01-02");

    expect(plan.cierre).not.toBeNull();
    expect(plan.cierre!.userCierre).toBe("cierre@t.com");
    expect(plan.fabricar).toHaveLength(1);
    expect(plan.fabricar[0]).toMatchObject({ productoDetalle: "Vainilla", cantPlan: 8 });
    expect(plan.cocinar).toHaveLength(1);
    expect(plan.cocinar[0]).toMatchObject({ productoDetalle: "Base Media", cantPlan: 20 });
    expect(plan.descongelar).toEqual([{ idProd: e.semi.idProd, detalle: "Base Media", descongelar: 3, faltante: 1 }]);
  });

  it("no incluye OPs canceladas ni de otras fechas", async () => {
    const e = await escenarioBasico();
    const r = await confirmarCierre(entradaCierre(e));
    await query(`UPDATE malaga.f_ordenes_produccion SET estado = 'cancelada' WHERE id_op = $1`, [r.opsCoccion[0]]);

    const plan = await getPlanDelDia("2030-01-02");
    expect(plan.cocinar).toEqual([]);
    expect(plan.fabricar).toHaveLength(1);

    const otroDia = await getPlanDelDia("2030-01-09");
    expect(otroDia.fabricar).toEqual([]);
    expect(otroDia.cierre).toBeNull();
  });

  it("si se repitió el cierre, el descongelado sale del último cierre", async () => {
    const e = await escenarioBasico();
    await confirmarCierre(entradaCierre(e));
    await confirmarCierre(entradaCierre(e));

    const plan = await getPlanDelDia("2030-01-02");
    expect(plan.descongelar).toHaveLength(1);
    expect(plan.fabricar).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts -t "plan del día"`
Expected: FAIL (`getPlanDelDia` no existe).

- [ ] **Step 3: Implementar `getPlanDelDia`**

Agregá al final de `src/lib/pcp/cierre-queries.ts`:

```ts
export interface OpDelPlan {
  idOp: number;
  productoDetalle: string;
  cantPlan: number;
  estado: string;
}

export interface DescongelarFila {
  idProd: number;
  detalle: string;
  descongelar: number;
  faltante: number;
}

export interface PlanDelDia {
  cierre: { idCierre: number; tsCierre: string; userCierre: string | null } | null;
  fabricar: OpDelPlan[];
  cocinar: OpDelPlan[];
  descongelar: DescongelarFila[];
}

async function listOpsDelDia(fecha: string, tipo: "PT" | "SEMI"): Promise<OpDelPlan[]> {
  const result = await query<{ id_op: number; detalle: string; cant_plan: string; estado: string }>(
    `SELECT o.id_op, p.detalle, o.cant_plan, o.estado
     FROM malaga.f_ordenes_produccion o
     JOIN malaga.d_productos p ON p.id_prod = o.id_prod
     WHERE o.fecha_plan = $1 AND p.tipo_producto = $2 AND o.estado <> 'cancelada'
     ORDER BY p.detalle, o.id_op`,
    [fecha, tipo]
  );
  return result.rows.map((r) => ({
    idOp: r.id_op,
    productoDetalle: r.detalle,
    cantPlan: Number(r.cant_plan),
    estado: r.estado,
  }));
}

// Lo que el equipo tiene que hacer en `fechaHoy`: OPs de fabricación y cocción con esa fecha
// y el descongelado del último cierre que planificó ese día.
export async function getPlanDelDia(fechaHoy: string): Promise<PlanDelDia> {
  const fabricar = await listOpsDelDia(fechaHoy, "PT");
  const cocinar = await listOpsDelDia(fechaHoy, "SEMI");

  const cierreResult = await query<{ id_cierre: number; ts_cierre: string; user_cierre: string | null }>(
    `SELECT c.id_cierre, c.ts_cierre::text AS ts_cierre, u.email AS user_cierre
     FROM malaga.f_cierre_dia c
     LEFT JOIN malaga.usuarios u ON u.id_user = c.user_cierre
     WHERE c.fecha_plan = $1
     ORDER BY c.ts_cierre DESC, c.id_cierre DESC
     LIMIT 1`,
    [fechaHoy]
  );
  const cierreRow = cierreResult.rows[0];
  if (!cierreRow) return { cierre: null, fabricar, cocinar, descongelar: [] };

  const descongelarResult = await query<{ id_prod: number; detalle: string; descongelar: string; faltante: string }>(
    `SELECT b.id_prod, p.detalle, b.descongelar, b.faltante
     FROM malaga.f_cierre_dia_base b
     JOIN malaga.d_productos p ON p.id_prod = b.id_prod
     WHERE b.id_cierre = $1 AND (b.descongelar > 0 OR b.faltante > 0)
     ORDER BY p.detalle`,
    [cierreRow.id_cierre]
  );

  return {
    cierre: { idCierre: cierreRow.id_cierre, tsCierre: cierreRow.ts_cierre, userCierre: cierreRow.user_cierre },
    fabricar,
    cocinar,
    descongelar: descongelarResult.rows.map((r) => ({
      idProd: r.id_prod,
      detalle: r.detalle,
      descongelar: Number(r.descongelar),
      faltante: Number(r.faltante),
    })),
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: PASS (todos, 22 en total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/cierre-queries.ts src/lib/pcp/cierre-queries.test.ts
git commit -m "feat: agregar plan del dia con fabricar, descongelar y cocinar"
```

---

### Task 8: Server actions

**Files:**
- Create: `src/app/(app)/pcp/cierre-actions.ts`
- Create: `src/app/(app)/pcp/config-actions.ts`

No llevan test automatizado propio (son una capa fina sobre funciones ya probadas); se verifican en el navegador en el Task 11.

- [ ] **Step 1: Crear la action de confirmación**

`src/app/(app)/pcp/cierre-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { confirmarCierre } from "@/lib/pcp/cierre-queries";
import { fechaEnMalaga, mananaEnMalaga } from "@/lib/pcp/fechas";

interface PayloadCierre {
  ausentes: number[];
  pctBachas: { idPartida: number; pct: number }[];
  stockReal: Record<string, number>;
  bachasOverride: Record<string, number>;
  cocinarOverride: Record<string, number>;
}

function numerarClaves(registro: Record<string, number> | undefined): Record<number, number> {
  const salida: Record<number, number> = {};
  for (const [clave, valor] of Object.entries(registro ?? {})) salida[Number(clave)] = valor;
  return salida;
}

export async function confirmarCierreAction(
  _prevState: { error?: string; ok?: boolean; opsFabricacion?: number; opsCoccion?: number } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  let payload: PayloadCierre;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Los datos del cierre no son válidos." };
  }

  try {
    const r = await confirmarCierre({
      fecha: fechaEnMalaga(),
      fechaPlan: mananaEnMalaga(),
      userCierre: user.idUser,
      ausentes: payload.ausentes ?? [],
      pctBachas: payload.pctBachas ?? [],
      stockReal: numerarClaves(payload.stockReal),
      bachasOverride: numerarClaves(payload.bachasOverride),
      cocinarOverride: numerarClaves(payload.cocinarOverride),
    });
    revalidatePath("/pcp");
    revalidatePath("/ordenes");
    revalidatePath("/exhibir");
    return { ok: true, opsFabricacion: r.opsFabricacion.length, opsCoccion: r.opsCoccion.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo confirmar el cierre." };
  }
}
```

- [ ] **Step 2: Crear las actions de configuración**

`src/app/(app)/pcp/config-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { setDemandaBase, updateConfigPcp } from "@/lib/pcp/cierre-queries";

export async function actualizarConfigPcpAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const margenPct = Number(formData.get("margenPct"));
  const diasCobertura = Number(formData.get("diasCobertura"));
  if (!Number.isFinite(margenPct) || margenPct < 0 || !Number.isFinite(diasCobertura) || diasCobertura < 0) return;

  await updateConfigPcp(margenPct, diasCobertura);
  revalidatePath("/pcp");
}

export async function actualizarDemandaBaseAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idProd = Number(formData.get("idProd"));
  const kgDia = Number(formData.get("kgDia"));
  if (!idProd || !Number.isFinite(kgDia) || kgDia < 0) return;

  await setDemandaBase(idProd, kgDia);
  revalidatePath("/pcp");
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit` — Expected: sin errores.
Run: `npx eslint "src/app/(app)/pcp/cierre-actions.ts" "src/app/(app)/pcp/config-actions.ts"` — Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/pcp/cierre-actions.ts" "src/app/(app)/pcp/config-actions.ts"
git commit -m "feat: agregar server actions del cierre y la configuracion de PCP"
```

---

### Task 9: Pantalla de cierre (componente cliente)

**Files:**
- Create: `src/app/(app)/pcp/CierreDiaForm.tsx`

El componente calcula en vivo con `calcularCierre` (las mismas funciones que usa el servidor) y manda al servidor solo las decisiones del usuario en un campo oculto `payload` (JSON). El servidor recalcula todo, así que lo que se ve y lo que se guarda no pueden diferir salvo por las ediciones manuales.

- [ ] **Step 1: Crear el componente**

`src/app/(app)/pcp/CierreDiaForm.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { confirmarCierreAction } from "./cierre-actions";
import { calcularCierre, type StockSabor } from "@/lib/pcp/cierre-calc";
import type { DatosCierre } from "@/lib/pcp/cierre-queries";

const PORCENTAJES = [0, 25, 50, 75, 100];

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

function aNumeros(editado: Record<number, string>): Record<number, number> {
  const salida: Record<number, number> = {};
  for (const [clave, valor] of Object.entries(editado)) {
    if (valor.trim() !== "" && Number.isFinite(Number(valor))) salida[Number(clave)] = Number(valor);
  }
  return salida;
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
      <p className="mb-3 text-xs text-ink-soft">{ayuda}</p>
      {children}
    </section>
  );
}

export function CierreDiaForm({ datos }: { datos: DatosCierre }) {
  const [state, formAction, pending] = useActionState(confirmarCierreAction, undefined);
  const [ausentes, setAusentes] = useState<Set<number>>(new Set());
  const [pcts, setPcts] = useState<Record<number, number>>({});
  const [stockReal, setStockReal] = useState<Record<number, string>>({});
  const [bachasEdit, setBachasEdit] = useState<Record<number, string>>({});
  const [cocinarEdit, setCocinarEdit] = useState<Record<number, string>>({});

  const stockSabores = useMemo(() => {
    const r: Record<number, StockSabor> = {};
    const de = (idProd: number) => (r[idProd] ??= { kgObrador: 0, kgExhibidaPonderada: 0 });
    for (const b of datos.bachasObrador) {
      if (!ausentes.has(b.idPartida)) de(b.idProd).kgObrador += b.cantidad;
    }
    for (const b of datos.bachasExhibidas) {
      const pct = pcts[b.idPartida];
      if (pct !== undefined) de(b.idProd).kgExhibidaPonderada += (b.cantidad * pct) / 100;
    }
    return r;
  }, [datos.bachasObrador, datos.bachasExhibidas, ausentes, pcts]);

  const bachasOverride = useMemo(() => aNumeros(bachasEdit), [bachasEdit]);
  const cocinarOverride = useMemo(() => aNumeros(cocinarEdit), [cocinarEdit]);

  const resultado = useMemo(
    () =>
      calcularCierre({
        margenPct: datos.margenPct,
        diasCobertura: datos.diasCobertura,
        sabores: datos.sabores,
        stockSabores,
        bases: datos.bases.map((b) => ({
          idProd: b.idProd,
          detalle: b.detalle,
          stockReal: Number(stockReal[b.idProd]) || 0,
          coccionesPendientes: b.coccionesPendientes,
          loteOptimo: b.loteOptimo,
          loteMinimo: b.loteMinimo,
        })),
        bachasOverride,
        cocinarOverride,
      }),
    [datos, stockSabores, stockReal, bachasOverride, cocinarOverride]
  );

  const faltanPct = datos.bachasExhibidas.filter((b) => pcts[b.idPartida] === undefined).length;
  const stockRealValido = (v: string | undefined) => v !== undefined && v.trim() !== "" && Number(v) >= 0;
  const faltanBases = datos.bases.filter((b) => !stockRealValido(stockReal[b.idProd])).length;
  const completo = faltanPct === 0 && faltanBases === 0;

  const payload = JSON.stringify({
    ausentes: Array.from(ausentes),
    pctBachas: Object.entries(pcts).map(([idPartida, pct]) => ({ idPartida: Number(idPartida), pct })),
    stockReal: Object.fromEntries(
      datos.bases.filter((b) => stockRealValido(stockReal[b.idProd])).map((b) => [b.idProd, Number(stockReal[b.idProd])])
    ),
    bachasOverride,
    cocinarOverride,
  });

  if (state?.ok) {
    return (
      <div className="card p-5 text-sm text-ink">
        Cierre confirmado: {state.opsFabricacion} OP{state.opsFabricacion === 1 ? "" : "s"} de fabricación y{" "}
        {state.opsCoccion} de cocción creadas para mañana. Mirá el resumen en{" "}
        <Link href="/pcp?tab=plan" className="font-semibold text-copper hover:text-copper-strong">
          Plan del día
        </Link>{" "}
        o las órdenes en{" "}
        <Link href="/ordenes" className="font-semibold text-copper hover:text-copper-strong">
          Órdenes
        </Link>
        .
      </div>
    );
  }

  const obradorPorSabor = new Map<string, typeof datos.bachasObrador>();
  for (const b of datos.bachasObrador) {
    const lista = obradorPorSabor.get(b.detalle) ?? [];
    lista.push(b);
    obradorPorSabor.set(b.detalle, lista);
  }

  const descongelarConDatos = resultado.bases.filter((b) => b.necesidadFabricacion > 0);
  const cocinarConDatos = resultado.bases.filter((b) => b.consumoDiario > 0 || b.kgACocinar > 0);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="payload" value={payload} />

      <Seccion
        titulo="1. Bachas del obrador"
        ayuda="Bachas terminadas que todavía no salieron a la exhibidora. Destildá las que no estén físicamente."
      >
        {datos.bachasObrador.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay bachas esperando en el obrador.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from(obradorPorSabor.entries()).map(([detalle, bachas]) => (
              <div key={detalle}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{detalle}</p>
                <div className="flex flex-col gap-1">
                  {bachas.map((b) => (
                    <label key={b.idPartida} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={!ausentes.has(b.idPartida)}
                        onChange={(e) => {
                          const siguiente = new Set(ausentes);
                          if (e.target.checked) siguiente.delete(b.idPartida);
                          else siguiente.add(b.idPartida);
                          setAusentes(siguiente);
                        }}
                      />
                      <span className="font-mono">{fmt(b.cantidad)} kg</span>
                      <span className="text-ink-soft">lote {b.lote}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="2. Bachas exhibidas"
        ayuda="¿Cuánto queda de cada bacha exhibida? Es obligatorio elegir un valor en todas."
      >
        {datos.bachasExhibidas.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay bachas exhibidas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {datos.bachasExhibidas.map((b) => (
              <div key={b.idPartida} className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-ink">
                  <span className="mr-2 font-mono text-xs text-ink-soft">#{b.nroPosicion}</span>
                  {b.detalle} <span className="text-xs text-ink-soft">({fmt(b.cantidad)} kg)</span>
                </div>
                <div className="flex gap-1">
                  {PORCENTAJES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPcts({ ...pcts, [b.idPartida]: p })}
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        pcts[b.idPartida] === p
                          ? "border-copper bg-copper text-white"
                          : "border-border text-ink hover:border-copper hover:text-copper"
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="3. Bases"
        ayuda="Cargá el stock real de cada base (congelado y descongelado juntos). Se guarda la diferencia con lo que dice el sistema."
      >
        {datos.bases.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay bases cargadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                  <th className="px-3 py-2">Base</th>
                  <th className="px-3 py-2 text-right">Teórico (sistema)</th>
                  <th className="px-3 py-2 text-right">Real (kg)</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {datos.bases.map((b) => {
                  const real = stockReal[b.idProd];
                  const diferencia = stockRealValido(real) ? Number(real) - b.stockTeorico : null;
                  return (
                    <tr key={b.idProd} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium text-ink">{b.detalle}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.stockTeorico)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={real ?? ""}
                          onChange={(e) => setStockReal({ ...stockReal, [b.idProd]: e.target.value })}
                          className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          diferencia === null || diferencia === 0 ? "text-ink-soft" : diferencia < 0 ? "text-bad" : "text-ok"
                        }`}
                      >
                        {diferencia === null ? "—" : `${diferencia > 0 ? "+" : ""}${fmt(diferencia)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="4. Plan de mañana"
        ayuda={`Demanda con margen de ${fmt(datos.margenPct)}%. Podés editar las bachas y los kg a cocinar antes de confirmar.`}
      >
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Fabricar (bachas)</h3>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3 py-2">Sabor</th>
                <th className="px-3 py-2 text-right">Demanda</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Pendientes</th>
                <th className="px-3 py-2 text-right">Bachas</th>
                <th className="px-3 py-2 text-right">Kg</th>
              </tr>
            </thead>
            <tbody>
              {resultado.fabricacion.map((f) => (
                <tr key={f.idProd} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">
                    {f.detalle}
                    {f.sinPeso && (
                      <span className="ml-2 rounded-full bg-warn-tint px-2 py-0.5 text-[10px] font-semibold text-warn">
                        sin peso estándar
                      </span>
                    )}
                    {f.demandaManana === 0 && (
                      <span className="ml-2 rounded-full bg-warn-tint px-2 py-0.5 text-[10px] font-semibold text-warn">
                        sin demanda cargada
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(f.demandaManana)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(f.stockDisponible)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(f.coccionesPendientes)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      disabled={f.sinPeso}
                      value={bachasEdit[f.idProd] ?? String(f.bachas)}
                      onChange={(e) => setBachasEdit({ ...bachasEdit, [f.idProd]: e.target.value })}
                      className="w-16 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm disabled:opacity-50"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{fmt(f.kgAFabricar)}</td>
                </tr>
              ))}
              {resultado.fabricacion.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-soft">
                    No hay sabores en la cartilla.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Descongelar (bases)</h3>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3 py-2">Base</th>
                <th className="px-3 py-2 text-right">Necesita la fabricación</th>
                <th className="px-3 py-2 text-right">Descongelar (kg)</th>
                <th className="px-3 py-2 text-right">Faltante</th>
              </tr>
            </thead>
            <tbody>
              {descongelarConDatos.map((b) => (
                <tr key={b.idProd} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{b.detalle}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.necesidadFabricacion)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{fmt(b.descongelar)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${b.faltante > 0 ? "font-semibold text-bad" : "text-ink-soft"}`}>
                    {b.faltante > 0 ? `faltan ${fmt(b.faltante)}` : "—"}
                  </td>
                </tr>
              ))}
              {descongelarConDatos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-ink-soft">
                    La fabricación de mañana no consume bases.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Cocinar (bases)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3 py-2">Base</th>
                <th className="px-3 py-2 text-right">Stock tras mañana</th>
                <th className="px-3 py-2 text-right">Objetivo ({fmt(datos.diasCobertura)} días)</th>
                <th className="px-3 py-2 text-right">Pendientes</th>
                <th className="px-3 py-2 text-right">Cocinar (kg)</th>
              </tr>
            </thead>
            <tbody>
              {cocinarConDatos.map((b) => (
                <tr key={b.idProd} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{b.detalle}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.stockTrasManana)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.objetivo)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.coccionesPendientes)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={cocinarEdit[b.idProd] ?? String(b.kgACocinar)}
                      onChange={(e) => setCocinarEdit({ ...cocinarEdit, [b.idProd]: e.target.value })}
                      className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                    />
                  </td>
                </tr>
              ))}
              {cocinarConDatos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-soft">
                    No hay bases para cocinar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Seccion>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !completo}
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
        >
          {pending ? "Confirmando..." : "Confirmar cierre y generar OPs"}
        </button>
        {!completo && (
          <span className="text-xs text-ink-soft">
            Falta elegir el % de {faltanPct} bacha{faltanPct === 1 ? "" : "s"} y cargar el stock real de {faltanBases}{" "}
            base{faltanBases === 1 ? "" : "s"}.
          </span>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc --noEmit` — Expected: sin errores.
Run: `npx eslint "src/app/(app)/pcp/CierreDiaForm.tsx"` — Expected: 0 errores (en particular, ningún `react-hooks/set-state-in-effect`: el componente no usa `useEffect`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/pcp/CierreDiaForm.tsx"
git commit -m "feat: agregar pantalla de cierre del dia de PCP"
```

---

### Task 10: Pestañas, configuración, plan del día y página

**Files:**
- Create: `src/app/(app)/pcp/ConfigTab.tsx`
- Create: `src/app/(app)/pcp/PlanDelDiaTab.tsx`
- Modify: `src/app/(app)/pcp/PcpTabs.tsx`
- Modify: `src/app/(app)/pcp/page.tsx`
- Delete: `src/app/(app)/pcp/PlanRevisionForm.tsx`, `src/app/(app)/pcp/actions.ts`

- [ ] **Step 1: Pestaña de configuración**

`src/app/(app)/pcp/ConfigTab.tsx`:

```tsx
import { getConfigPcp, listDemandaBase } from "@/lib/pcp/cierre-queries";
import { actualizarConfigPcpAction, actualizarDemandaBaseAction } from "./config-actions";

export async function ConfigTab() {
  const [config, demanda] = await Promise.all([getConfigPcp(), listDemandaBase()]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Margen y cobertura</h2>
        <form action={actualizarConfigPcpAction} className="card flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Margen de seguridad sobre la demanda (%)
            <input
              name="margenPct"
              type="number"
              step="0.01"
              min="0"
              defaultValue={config.margenPct}
              className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            Días de cobertura de las bases
            <input
              name="diasCobertura"
              type="number"
              step="0.01"
              min="0"
              defaultValue={config.diasCobertura}
              className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-sm"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
          >
            Guardar
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Demanda por sabor (kg por día)</h2>
        <div className="card flex max-h-[28rem] flex-col gap-2 overflow-y-auto p-4">
          {demanda.map((d) => (
            <form key={d.idProd} action={actualizarDemandaBaseAction} className="flex items-center justify-between gap-2">
              <input type="hidden" name="idProd" value={d.idProd} />
              <span className="truncate text-sm text-ink">{d.detalle}</span>
              <div className="flex flex-none items-center gap-1.5">
                <input
                  name="kgDia"
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={d.kgDia}
                  className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                />
                <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                  Guardar
                </button>
              </div>
            </form>
          ))}
          {demanda.length === 0 && <p className="text-sm text-ink-soft">No hay sabores en la cartilla todavía.</p>}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Pestaña "Plan del día"**

`src/app/(app)/pcp/PlanDelDiaTab.tsx`:

```tsx
import { getPlanDelDia, type OpDelPlan } from "@/lib/pcp/cierre-queries";
import { fechaEnMalaga } from "@/lib/pcp/fechas";
import { formatFechaHora } from "@/lib/formatDate";

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

function ListaOps({ titulo, ops, unidad }: { titulo: string; ops: OpDelPlan[]; unidad: string }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink">{titulo}</h2>
      <div className="card p-4">
        {ops.length === 0 ? (
          <p className="text-sm text-ink-soft">Nada para hoy.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm text-ink">
            {ops.map((o) => (
              <li key={o.idOp} className="flex justify-between gap-3">
                <span>
                  {o.productoDetalle} <span className="font-mono text-xs text-ink-soft">OP-{o.idOp}</span>
                </span>
                <span className="font-mono">
                  {fmt(o.cantPlan)} {unidad}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export async function PlanDelDiaTab() {
  const plan = await getPlanDelDia(fechaEnMalaga());

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-ink-soft">
        {plan.cierre
          ? `Según el cierre de ${plan.cierre.userCierre ?? "—"} (${formatFechaHora(plan.cierre.tsCierre)}).`
          : "Todavía no se hizo el cierre del día anterior."}
      </p>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ListaOps titulo="Fabricar" ops={plan.fabricar} unidad="kg" />
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Descongelar</h2>
          <div className="card p-4">
            {plan.descongelar.length === 0 ? (
              <p className="text-sm text-ink-soft">Nada para descongelar.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm text-ink">
                {plan.descongelar.map((d) => (
                  <li key={d.idProd} className="flex justify-between gap-3">
                    <span>{d.detalle}</span>
                    <span className="font-mono">
                      {fmt(d.descongelar)} kg
                      {d.faltante > 0 && <span className="ml-2 font-semibold text-bad">faltan {fmt(d.faltante)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <ListaOps titulo="Cocinar" ops={plan.cocinar} unidad="kg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Pestañas**

Reemplazá todo `src/app/(app)/pcp/PcpTabs.tsx`:

```tsx
import Link from "next/link";

export type PestaniaPcp = "cierre" | "plan" | "config" | "estadisticas";

export function PcpTabs({ activa, esGestion }: { activa: PestaniaPcp; esGestion: boolean }) {
  const pestanias: { id: PestaniaPcp; label: string; href: string }[] = [
    { id: "cierre", label: "Cierre del día", href: "/pcp" },
    { id: "plan", label: "Plan del día", href: "/pcp?tab=plan" },
    ...(esGestion
      ? [
          { id: "config" as const, label: "Configuración", href: "/pcp?tab=config" },
          { id: "estadisticas" as const, label: "Estadísticas", href: "/pcp?tab=estadisticas" },
        ]
      : []),
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {pestanias.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          prefetch={false}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            activa === p.id ? "border-b-2 border-copper text-ink" : "text-ink-soft hover:text-ink"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Página**

Reemplazá todo `src/app/(app)/pcp/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { getDatosCierre } from "@/lib/pcp/cierre-queries";
import { CierreDiaForm } from "./CierreDiaForm";
import { ConfigTab } from "./ConfigTab";
import { EstadisticasTab } from "./EstadisticasTab";
import { PcpTabs, type PestaniaPcp } from "./PcpTabs";
import { PlanDelDiaTab } from "./PlanDelDiaTab";

export default async function PcpPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireRole(["gestion", "admin", "produccion"]);
  const esGestion = user.rol === "gestion" || user.rol === "admin";
  const { tab } = await searchParams;

  if ((tab === "config" || tab === "estadisticas") && !esGestion) redirect("/pcp");

  const activa: PestaniaPcp =
    tab === "plan" ? "plan" : tab === "config" ? "config" : tab === "estadisticas" ? "estadisticas" : "cierre";

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-5">
        <p className="page-eyebrow mb-1">Cierre del día</p>
        <h1 className="text-xl font-semibold text-ink">PCP</h1>
      </div>

      <PcpTabs activa={activa} esGestion={esGestion} />

      <div className="mt-5">
        {activa === "cierre" && <CierreDiaForm datos={await getDatosCierre()} />}
        {activa === "plan" && <PlanDelDiaTab />}
        {activa === "config" && <ConfigTab />}
        {activa === "estadisticas" && <EstadisticasTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Borrar lo que quedó sin uso**

Confirmá que nada más usa lo viejo:

Run: `grep -rn "PlanRevisionForm\|generarPlanAction\|pcp/actions" src` (con la herramienta Grep)
Expected: sin resultados fuera de los propios archivos a borrar.

Después:

```bash
git rm "src/app/(app)/pcp/PlanRevisionForm.tsx" "src/app/(app)/pcp/actions.ts"
```

(Las funciones `calcularPlanManana` y `generarPlanManana` de `src/lib/pcp/queries.ts` y sus tests NO se borran: quedan como base para una demanda automática futura.)

- [ ] **Step 6: Verificar tipos y lint**

Run: `npx tsc --noEmit` — Expected: 0 errores.
Run: `npm run lint` — Expected: 0 errores (los warnings preexistentes de `_prevState/_formData` en `temperaturas/actions.ts` son esperables).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/pcp/ConfigTab.tsx" "src/app/(app)/pcp/PlanDelDiaTab.tsx" "src/app/(app)/pcp/PcpTabs.tsx" "src/app/(app)/pcp/page.tsx"
git commit -m "feat: reemplazar el plan de PCP por el cierre del dia, plan del dia y configuracion"
```

(El `git rm` del paso anterior ya dejó los borrados en el índice; el commit los incluye.)

---

### Task 11: Verificación final

**Files:** ninguno (solo verificación; si encontrás un bug, corregilo con su test y commiteá aparte).

- [ ] **Step 1: Suite completa**

Run: `npm run test:db`
Expected: todos los archivos de test pasan. La suite vacía productos, recetas, exhibidora y partidas de la base compartida: es esperado (el dueño del proyecto autorizó correrla).

- [ ] **Step 2: Lint y tipos**

Run: `npm run lint` — Expected: 0 errores.
Run: `npx tsc --noEmit` — Expected: 0 errores.

- [ ] **Step 3: Restaurar el catálogo para poder probar en el navegador**

```bash
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/import-historico.ts
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/import-recetas.ts
```

Expected: 53 productos, 7862 partidas, 36 recetas, "Importación completa".

- [ ] **Step 4: Verificación manual en el navegador (cuenta de prueba)**

Levantá el servidor de desarrollo con `preview_start` (config `malaga-soft`). Creá dos cuentas de prueba temporales con `npm run create-user` (mirá `scripts/create-user.ts` para los argumentos): una con rol `admin` (`qa-pcp-admin@test.local`) y otra con rol `produccion` (`qa-pcp-prod@test.local`), con contraseñas aleatorias. Verificá, logueado como `admin`:

1. `/pcp?tab=config`: guardar margen 20 y días de cobertura 3; cargar `kg/día` en 3 o 4 sabores (por ejemplo 10, 8, 6).
2. `/pcp` (Cierre del día): se ven los 4 bloques. Con el botón sin elegir % ni stock real, "Confirmar" está deshabilitado y el texto dice cuántas bachas y bases faltan.
3. Elegir un % en cada bacha exhibida y cargar el stock real de todas las bases: el botón se habilita y las tablas del bloque 4 se recalculan al cambiar un % (verificá un caso a mano: demanda = kg/día × 1,2; stock = obrador + kg exhibida × %; bachas = redondeo hacia arriba).
4. Editar las bachas de un sabor: cambia el kg y el descongelado de las bases que usa.
5. Confirmar: aparece el mensaje con la cantidad de OPs; en `/ordenes` están las OPs de fabricación y de cocción con fecha de mañana.
6. `/pcp?tab=plan`: muestra hoy solo lo que tenga `fecha_plan` = hoy (para ver datos reales, cambiá a mano `fecha_plan` de esas OPs a hoy con un script temporal, o repetí la prueba cuando sea el día siguiente); verificá que la pantalla carga sin errores y muestra "Nada para hoy" cuando no hay OPs de hoy.
7. Repetir el cierre inmediatamente: no se crean OPs nuevas (aparecen 0 y 0) y el descongelado sigue igual.
8. Logueado como `produccion`: `/pcp` y `/pcp?tab=plan` funcionan; las pestañas Configuración y Estadísticas no aparecen, y entrar a `/pcp?tab=config` por URL redirige a `/pcp`.
9. Sin errores en la consola del navegador en ningún paso.

- [ ] **Step 5: Limpieza de la verificación manual**

Borrá las dos cuentas de prueba y sus sesiones (primero `malaga.sesiones`), y dejá la base sin restos de la prueba:

```sql
TRUNCATE malaga.f_cierre_dia_base, malaga.f_cierre_dia_sabor, malaga.f_cierre_dia_bacha, malaga.f_cierre_dia CASCADE;
```

Después volvé a correr `import-historico.ts` y `import-recetas.ts` (Step 3) para eliminar OPs de prueba y restaurar las partidas dadas de baja en la prueba. Confirmá con una consulta que `malaga.usuarios` quedó con las mismas cuentas que antes de empezar (las 8 reales y `t@t.com`) y que no quedaron scripts temporales en `scripts/`.

- [ ] **Step 6: Estado del repositorio**

Run: `git status --short` y `git log --oneline -15`
Expected: los commits de los Tasks 1 a 10 presentes; lo único sin commitear son archivos ajenos preexistentes (si los hay) y `.claude/`.

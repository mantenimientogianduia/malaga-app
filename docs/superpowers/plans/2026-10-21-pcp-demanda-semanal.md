# PCP: demanda semanal por sabor y por día Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cierre del día calcule la demanda a partir de una demanda semanal pronosticada (550 kg por defecto) repartida por un % por sabor y un % por día de la semana, y que la cobertura de las bases use el consumo esperado de cada uno de los próximos días.

**Architecture:** Funciones puras nuevas (`src/lib/pcp/demanda.ts`) calculan la demanda de un día y los pesos de la ventana de cobertura; `calcularBases` pasa a sumar el consumo esperado día por día. La base reemplaza la tabla de kg/día por sabor por una de % por sabor y otra de % por día, más la demanda semanal en la configuración. `getDatosCierre(fechaPlan)` arma, por sabor, la demanda del día del plan y la de los días siguientes. La pestaña Configuración edita todo con tablas que muestran la suma de los % en vivo, y un script idempotente carga los valores iniciales.

**Tech Stack:** Next.js 16 App Router, TypeScript, Postgres con SQL crudo (`src/lib/db.ts`), node-pg-migrate, vitest (`npm run test:db`).

**Spec:** `docs/superpowers/specs/2026-10-21-pcp-demanda-semanal-design.md`

---

## Contexto para quien implemente

- **Base de datos:** `npm run test:db` corre contra la base compartida (todavía sin datos reales; el dueño autorizó correr la suite completa libremente). Cada corrida completa vacía productos, recetas, exhibidora y partidas (y, por CASCADE, `pcp_pct_sabor`): para volver a tener catálogo hay que correr `scripts/import-historico.ts`, `scripts/import-recetas.ts` y, de este plan, `scripts/seed-pcp.ts` (Task 8). Los tests de PCP usan el usuario `cierre@t.com`; **nunca** `TRUNCATE` de `malaga.usuarios`.
- **Código que ya existe y se modifica** (leelo antes de tocarlo): `src/lib/pcp/cierre-calc.ts` (+ `cierre-calc.test.ts`), `src/lib/pcp/cierre-queries.ts` (+ `cierre-queries.test.ts`, que tiene helpers `limpiar()`, `seedUser()`, `escenarioBasico()`, `entradaCierre()` y `TIMEOUT_ESCENARIO`), `src/app/(app)/pcp/{config-actions.ts,ConfigTab.tsx,page.tsx}`. `getDatosCierre()` hoy no recibe parámetros y usa `listDemandaBase()` (kg/día por sabor); eso es lo que se reemplaza.
- **Unidades:** `SaborCierre.demandaBaseKgDia` pasa a significar "demanda del **día del plan** en kg, sin margen" (ya no un valor fijo por día). El margen se aplica después, como hoy.
- **React:** el proyecto tiene `react-hooks/set-state-in-effect` como error de ESLint: no uses `useEffect` para sincronizar estado.
- **Next.js 16:** si algo de las APIs no te cierra, leé `node_modules/next/dist/docs/`.
- **Trabajo ajeno:** si hay cambios sin commitear que no son tuyos, no los toques: `git add <ruta exacta>`, nunca `git add -A` ni `git commit -a`.
- **Comandos:** un archivo de tests: `npm run test:db -- src/lib/pcp/demanda.test.ts`; suite completa: `npm run test:db`; migraciones: `npm run migrate:up`; lint: `npm run lint`; tipos: `npx tsc --noEmit`.
- **Fechas útiles para los tests** (verificadas): 2030-01-01 es martes; 2030-01-02 miércoles; 2030-01-03 jueves; 2030-01-07 lunes. 2026-10-21 es miércoles; 2026-10-25 domingo; 2026-10-26 lunes.

---

## File Structure

- **Create:** `migrations/1791200000000_pcp-demanda-semanal.js`
- **Create:** `src/lib/pcp/demanda.ts` + `demanda.test.ts` — demanda de un día, día de la semana, pesos de cobertura, suma de %.
- **Modify:** `src/lib/pcp/cierre-calc.ts` + `cierre-calc.test.ts` — cobertura día por día.
- **Create:** `src/lib/pcp/seed.ts` + `seed.test.ts` — valores iniciales y emparejamiento por nombre (puro).
- **Modify:** `src/lib/pcp/cierre-queries.ts` + `cierre-queries.test.ts` — configuración, % por día, % por sabor, `getDatosCierre(fechaPlan)`.
- **Modify:** `src/app/(app)/pcp/config-actions.ts`, `ConfigTab.tsx`, `page.tsx`, `cierre-actions.ts` (si llama a `getDatosCierre`).
- **Create:** `src/app/(app)/pcp/TablaPct.tsx` — tabla de % editable con suma en vivo (cliente).
- **Create:** `scripts/seed-pcp.ts` — carga los valores iniciales.

---

### Task 1: Migración

**Files:**
- Create: `migrations/1791200000000_pcp-demanda-semanal.js`

- [ ] **Step 1: Escribir la migración**

```js
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.pcp_config
      ADD COLUMN demanda_semanal_kg NUMERIC(10,2) NOT NULL DEFAULT 550 CHECK (demanda_semanal_kg >= 0);

    CREATE TABLE malaga.pcp_pct_dia (
      dia_semana SMALLINT PRIMARY KEY CHECK (dia_semana BETWEEN 1 AND 7),
      pct NUMERIC(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100)
    );

    INSERT INTO malaga.pcp_pct_dia (dia_semana, pct) VALUES
      (1, 13), (2, 13), (3, 13), (4, 13), (5, 16), (6, 16), (7, 16);

    CREATE TABLE malaga.pcp_pct_sabor (
      id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
      pct NUMERIC(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100)
    );

    DROP TABLE malaga.pcp_demanda_base;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.pcp_demanda_base (
      id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
      kg_dia NUMERIC(12,3) NOT NULL CHECK (kg_dia >= 0)
    );

    DROP TABLE malaga.pcp_pct_sabor;
    DROP TABLE malaga.pcp_pct_dia;
    ALTER TABLE malaga.pcp_config DROP COLUMN demanda_semanal_kg;
  `);
};
```

- [ ] **Step 2: Aplicarla**

Run: `npm run migrate:up`
Expected: `1791200000000_pcp-demanda-semanal` aplicada y `Migrations complete!`. (Si falla por conexión, revisá que `DATABASE_URL` y `PGHOST` del `.env` apunten a la base vigente; no los cambies.)

- [ ] **Step 3: Verificar**

Creá `scripts/_tmp-verify.ts`:

```ts
import { query } from "../src/lib/db";
(async () => {
  const c = await query<{ demanda_semanal_kg: string }>(`SELECT demanda_semanal_kg FROM malaga.pcp_config WHERE id = 1`);
  const d = await query<{ dia_semana: number; pct: string }>(`SELECT dia_semana, pct FROM malaga.pcp_pct_dia ORDER BY dia_semana`);
  const t = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'malaga' AND table_name IN ('pcp_pct_sabor','pcp_demanda_base') ORDER BY table_name`
  );
  console.log(c.rows[0].demanda_semanal_kg, d.rows.map((r) => `${r.dia_semana}:${r.pct}`).join(","), t.rows.map((r) => r.table_name).join(","));
  process.exit(0);
})();
```

Run: `npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/_tmp-verify.ts`
Expected: `550.00 1:13.00,2:13.00,3:13.00,4:13.00,5:16.00,6:16.00,7:16.00 pcp_pct_sabor`. Después borrá el script.

- [ ] **Step 4: Commit**

```bash
git add migrations/1791200000000_pcp-demanda-semanal.js
git commit -m "feat: agregar demanda semanal y porcentajes por dia y por sabor a PCP"
```

---

### Task 2: Funciones puras de demanda

**Files:**
- Create: `src/lib/pcp/demanda.ts`
- Test: `src/lib/pcp/demanda.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/pcp/demanda.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEMANDA_SEMANAL_INICIAL,
  PCT_DIA_INICIAL,
  demandaDiaSabor,
  diaSemanaDeFecha,
  pesosCobertura,
  sumaPct,
} from "./demanda";

describe("demandaDiaSabor", () => {
  it("reparte la demanda semanal por sabor y por día", () => {
    // 550 kg × 6 % del sabor × 13 % del día = 4,29 kg
    expect(demandaDiaSabor(550, 6, 13)).toBeCloseTo(4.29, 5);
    // 550 kg × 6 % × 16 % = 5,28 kg
    expect(demandaDiaSabor(550, 6, 16)).toBeCloseTo(5.28, 5);
  });

  it("devuelve 0 si algún porcentaje es 0", () => {
    expect(demandaDiaSabor(550, 0, 13)).toBe(0);
    expect(demandaDiaSabor(550, 6, 0)).toBe(0);
  });
});

describe("valores iniciales", () => {
  it("la demanda semanal arranca en 550 y los días suman 100 %", () => {
    expect(DEMANDA_SEMANAL_INICIAL).toBe(550);
    expect(PCT_DIA_INICIAL).toEqual([13, 13, 13, 13, 16, 16, 16]);
    expect(sumaPct(PCT_DIA_INICIAL)).toBe(100);
  });
});

describe("diaSemanaDeFecha", () => {
  it("devuelve 1 para lunes y 7 para domingo", () => {
    expect(diaSemanaDeFecha("2026-10-26")).toBe(1);
    expect(diaSemanaDeFecha("2026-10-21")).toBe(3);
    expect(diaSemanaDeFecha("2026-10-25")).toBe(7);
    expect(diaSemanaDeFecha("2030-01-07")).toBe(1);
  });
});

describe("pesosCobertura", () => {
  it("enteros: un peso 1 por día", () => {
    expect(pesosCobertura(3)).toEqual([1, 1, 1]);
    expect(pesosCobertura(1)).toEqual([1]);
  });

  it("fraccionarios: el último día pesa el resto", () => {
    expect(pesosCobertura(2.5)).toEqual([1, 1, 0.5]);
    expect(pesosCobertura(0.3)).toEqual([0.3]);
  });

  it("0 o negativo: sin días", () => {
    expect(pesosCobertura(0)).toEqual([]);
    expect(pesosCobertura(-2)).toEqual([]);
  });

  it("la ventana nunca supera 60 días", () => {
    expect(pesosCobertura(1000)).toHaveLength(60);
  });
});

describe("sumaPct", () => {
  it("suma con dos decimales sin errores de punto flotante", () => {
    expect(sumaPct([0.1, 0.2])).toBe(0.3);
    expect(sumaPct([6, 5.6, 4.2, 5])).toBe(20.8);
    expect(sumaPct([])).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test:db -- src/lib/pcp/demanda.test.ts`
Expected: FAIL (no se puede importar `./demanda`).

- [ ] **Step 3: Implementar**

`src/lib/pcp/demanda.ts`:

```ts
export const DEMANDA_SEMANAL_INICIAL = 550;
// Porcentaje de la semana que cae en cada día, de lunes (índice 0) a domingo (índice 6).
export const PCT_DIA_INICIAL = [13, 13, 13, 13, 16, 16, 16];

const MAX_DIAS_COBERTURA = 60;

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

// kg de un sabor en un día: demanda semanal × % del sabor × % del día.
export function demandaDiaSabor(demandaSemanalKg: number, pctSabor: number, pctDia: number): number {
  return redondear3((demandaSemanalKg * pctSabor * pctDia) / 10000);
}

// Día ISO de la semana (1 = lunes ... 7 = domingo) de una fecha 'YYYY-MM-DD'.
export function diaSemanaDeFecha(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const diaJs = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return diaJs === 0 ? 7 : diaJs;
}

// Peso de cada día de la ventana de cobertura: 3 -> [1, 1, 1]; 2,5 -> [1, 1, 0,5]; 0 -> [].
export function pesosCobertura(diasCobertura: number): number[] {
  const pesos: number[] = [];
  let restante = diasCobertura;
  while (restante > 1e-9 && pesos.length < MAX_DIAS_COBERTURA) {
    pesos.push(Math.min(1, redondear3(restante)));
    restante = redondear3(restante - 1);
  }
  return pesos;
}

export function sumaPct(pcts: number[]): number {
  return redondear2(pcts.reduce((acc, p) => acc + p, 0));
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test:db -- src/lib/pcp/demanda.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/demanda.ts src/lib/pcp/demanda.test.ts
git commit -m "feat: agregar calculo puro de la demanda diaria por sabor y de la ventana de cobertura"
```

---

### Task 3: Cobertura día por día en el cálculo de bases

**Files:**
- Modify: `src/lib/pcp/cierre-calc.ts`
- Test: `src/lib/pcp/cierre-calc.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/pcp/cierre-calc.test.ts` agregá un `describe` al final (usa los helpers `sabor()` y `base()` que ya están definidos al principio del archivo):

```ts
describe("calcularBases con demanda distinta por día", () => {
  const conItem = (parcial: Partial<SaborCierre> = {}) =>
    sabor({ items: [{ idSubprod: 100, cantSubprod: 2 }], ...parcial });

  it("el objetivo suma el consumo esperado de cada día de la ventana", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaSiguientesKg: [10, 20] })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 2,
    });
    // día 1: 2 × 10 / 4 = 5; día 2: 2 × 20 / 4 = 10 -> objetivo 15, promedio 7,5
    expect(filas[0].objetivo).toBeCloseTo(15, 5);
    expect(filas[0].consumoDiario).toBeCloseTo(7.5, 5);
    expect(filas[0].aReponer).toBeCloseTo(15, 5);
  });

  it("un último día fraccionario pesa solo la fracción", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaSiguientesKg: [10, 20] })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 1.5,
    });
    // 1 × 5 + 0,5 × 10 = 10
    expect(filas[0].objetivo).toBeCloseTo(10, 5);
  });

  it("aplica el margen al consumo de cada día", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaSiguientesKg: [10, 20] })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 20,
      diasCobertura: 2,
    });
    expect(filas[0].objetivo).toBeCloseTo(18, 5); // 15 × 1,2
  });

  it("sin demandaSiguientesKg usa la demanda del día del plan para todos los días", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaBaseKgDia: 10 })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 3,
    });
    // 3 días × (2 × 10 / 4) = 15
    expect(filas[0].objetivo).toBeCloseTo(15, 5);
    expect(filas[0].consumoDiario).toBeCloseTo(5, 5);
  });

  it("con 0 días de cobertura no hay objetivo, pero el consumo diario sigue informado", () => {
    const filas = calcularBases({
      sabores: [conItem({ demandaBaseKgDia: 10 })],
      bachasMananaPorSabor: new Map([[1, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 0,
    });
    expect(filas[0].objetivo).toBe(0);
    expect(filas[0].consumoDiario).toBeCloseTo(5, 5);
  });

  it("suma el consumo de varios sabores que usan la misma base, cada uno con sus días", () => {
    const filas = calcularBases({
      sabores: [
        conItem({ idProd: 1, demandaSiguientesKg: [10, 20] }),
        sabor({ idProd: 2, pesoEstandar: 5, items: [{ idSubprod: 100, cantSubprod: 1 }], demandaSiguientesKg: [5, 5] }),
      ],
      bachasMananaPorSabor: new Map([[1, 0], [2, 0]]),
      bases: [base({ stockReal: 0 })],
      margenPct: 0,
      diasCobertura: 2,
    });
    // sabor 1: 5 + 10 = 15; sabor 2: 1 × 5 / 5 = 1 por día -> 2; total 17
    expect(filas[0].objetivo).toBeCloseTo(17, 5);
  });
});
```

Si `SaborCierre` no está importado como tipo en ese archivo, agregalo al import existente de `./cierre-calc`.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/pcp/cierre-calc.test.ts`
Expected: FAIL (TypeScript no conoce `demandaSiguientesKg`/los valores de objetivo no coinciden).

- [ ] **Step 3: Implementar en `src/lib/pcp/cierre-calc.ts`**

1. Importá: `import { pesosCobertura } from "./demanda";`
2. En `SaborCierre`, agregá el campo opcional y aclará el comentario de `demandaBaseKgDia`:

```ts
  // Demanda del día del plan en kg, sin margen.
  demandaBaseKgDia: number;
  // Demanda sin margen (kg) de cada día de la ventana de cobertura, empezando por el día siguiente
  // al del plan. Si falta, se asume la demanda del día del plan para todos los días.
  demandaSiguientesKg?: number[];
```

3. Reemplazá el cuerpo de `calcularBases` (dejando la firma y los demás campos del resultado igual) para calcular `objetivo` día por día:

```ts
export function calcularBases(args: {
  sabores: SaborCierre[];
  // idProd del sabor -> bachas que se fabrican mañana (nuevas + ya pendientes).
  bachasMananaPorSabor: Map<number, number>;
  bases: BaseCierre[];
  margenPct: number;
  diasCobertura: number;
}): FilaBase[] {
  const pesos = pesosCobertura(args.diasCobertura);
  const factorMargen = 1 + args.margenPct / 100;

  return args.bases.map((base) => {
    let necesidad = 0;
    let consumoPlan = 0; // consumo del día del plan (para informar cuando no hay ventana)
    let objetivoBruto = 0;
    for (const sabor of args.sabores) {
      const cantPorBacha = sabor.items
        .filter((i) => i.idSubprod === base.idProd)
        .reduce((acc, i) => acc + i.cantSubprod, 0);
      if (cantPorBacha === 0) continue;
      necesidad += cantPorBacha * (args.bachasMananaPorSabor.get(sabor.idProd) ?? 0);
      if (sabor.pesoEstandar && sabor.pesoEstandar > 0) {
        const kgBacha = (kg: number) => (cantPorBacha * kg * factorMargen) / (sabor.pesoEstandar as number);
        consumoPlan += kgBacha(sabor.demandaBaseKgDia);
        const porDia = sabor.demandaSiguientesKg ?? pesos.map(() => sabor.demandaBaseKgDia);
        pesos.forEach((peso, k) => {
          objetivoBruto += peso * kgBacha(porDia[k] ?? 0);
        });
      }
    }
    const necesidadFabricacion = redondear3(necesidad);
    const objetivo = redondear3(objetivoBruto);
    // Con ventana: promedio de la ventana; sin ventana (0 días): el consumo del día del plan.
    const consumoDiario = pesos.length > 0 ? redondear3(objetivo / args.diasCobertura) : redondear3(consumoPlan);
    const descongelar = redondear3(Math.min(necesidadFabricacion, base.stockReal));
    const faltante = redondear3(Math.max(necesidadFabricacion - base.stockReal, 0));
    const stockTrasManana = redondear3(base.stockReal - descongelar);
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
```

(El resto del archivo —`calcularFabricacion`, `calcularCierre`— no cambia.)

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/pcp/cierre-calc.test.ts`
Expected: PASS (los 24 tests anteriores —que cubren el comportamiento sin `demandaSiguientesKg`— más los 6 nuevos).
Run: `npx tsc --noEmit` y `npx eslint src/lib/pcp/cierre-calc.ts src/lib/pcp/cierre-calc.test.ts` — Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/cierre-calc.ts src/lib/pcp/cierre-calc.test.ts
git commit -m "feat: calcular la cobertura de las bases dia por dia"
```

---

### Task 4: Valores iniciales y emparejamiento por nombre (puro)

**Files:**
- Create: `src/lib/pcp/seed.ts`
- Test: `src/lib/pcp/seed.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/pcp/seed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PCT_SABORES_INICIALES, emparejarPorNombre, normalizarNombre } from "./seed";
import { sumaPct } from "./demanda";

describe("PCT_SABORES_INICIALES", () => {
  it("son 24 sabores y suman 100 %", () => {
    expect(PCT_SABORES_INICIALES).toHaveLength(24);
    expect(sumaPct(PCT_SABORES_INICIALES.map((s) => s.pct))).toBe(100);
  });
});

describe("normalizarNombre", () => {
  it("ignora mayúsculas, acentos y espacios repetidos", () => {
    expect(normalizarNombre("  Málaga ")).toBe("malaga");
    expect(normalizarNombre("LIMÓN  con   cascaritas")).toBe("limon con cascaritas");
  });
});

describe("emparejarPorNombre", () => {
  it("empareja ignorando mayúsculas y acentos e informa los que no encuentra", () => {
    const productos = [
      { idProd: 1, detalle: "Malaga" },
      { idProd: 2, detalle: "KINDER BUENO" },
      { idProd: 3, detalle: "Otro sabor" },
    ];
    const r = emparejarPorNombre(
      [
        { nombre: "Málaga", pct: 3 },
        { nombre: "Kinder Bueno", pct: 6 },
        { nombre: "Sabor que no existe", pct: 1 },
      ],
      productos
    );
    expect(r.encontrados).toEqual([
      { idProd: 1, nombre: "Málaga", pct: 3 },
      { idProd: 2, nombre: "Kinder Bueno", pct: 6 },
    ]);
    expect(r.noEncontrados).toEqual(["Sabor que no existe"]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test:db -- src/lib/pcp/seed.test.ts`
Expected: FAIL (no se puede importar `./seed`).

- [ ] **Step 3: Implementar**

`src/lib/pcp/seed.ts`:

```ts
export interface PctSaborInicial {
  nombre: string;
  pct: number;
}

// % de venta de cada sabor sobre el total, definidos por el dueño del negocio (suman 100).
export const PCT_SABORES_INICIALES: PctSaborInicial[] = [
  { nombre: "Kinder Bueno", pct: 6 },
  { nombre: "Pistacho", pct: 5.6 },
  { nombre: "Crema Oreo", pct: 4.2 },
  { nombre: "Choco Dubai", pct: 5 },
  { nombre: "Frangipane", pct: 3.7 },
  { nombre: "Cheesecake", pct: 3.8 },
  { nombre: "Málaga", pct: 3 },
  { nombre: "Pistacho macaron", pct: 4.4 },
  { nombre: "Fresa", pct: 4 },
  { nombre: "Limon con cascaritas", pct: 4 },
  { nombre: "Chocolate belga", pct: 5 },
  { nombre: "Banana Toffee", pct: 4 },
  { nombre: "Lemon pie", pct: 3.7 },
  { nombre: "Dulce de Leche Rogel", pct: 4.8 },
  { nombre: "Oro y Oro", pct: 3 },
  { nombre: "DDL Granizado", pct: 3.3 },
  { nombre: "Gianduia", pct: 4.5 },
  { nombre: "Snickers", pct: 4 },
  { nombre: "Vainilla", pct: 4.5 },
  { nombre: "Mango - Maracuya", pct: 6 },
  { nombre: "Ciocco Nero (con macadamia)", pct: 3.6 },
  { nombre: "Tiramisu", pct: 3 },
  { nombre: "Yogurt Crock", pct: 2.5 },
  { nombre: "Caramel Lets pop", pct: 4.4 },
];

export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function emparejarPorNombre(
  deseados: PctSaborInicial[],
  productos: { idProd: number; detalle: string }[]
): { encontrados: { idProd: number; nombre: string; pct: number }[]; noEncontrados: string[] } {
  const porNombre = new Map(productos.map((p) => [normalizarNombre(p.detalle), p.idProd]));
  const encontrados: { idProd: number; nombre: string; pct: number }[] = [];
  const noEncontrados: string[] = [];
  for (const d of deseados) {
    const idProd = porNombre.get(normalizarNombre(d.nombre));
    if (idProd === undefined) noEncontrados.push(d.nombre);
    else encontrados.push({ idProd, nombre: d.nombre, pct: d.pct });
  }
  return { encontrados, noEncontrados };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test:db -- src/lib/pcp/seed.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pcp/seed.ts src/lib/pcp/seed.test.ts
git commit -m "feat: agregar valores iniciales de porcentajes por sabor y emparejamiento por nombre"
```

---

### Task 5: Consultas de configuración y datos del cierre

**Files:**
- Modify: `src/lib/pcp/cierre-queries.ts`
- Modify: `src/lib/pcp/cierre-queries.test.ts`

Reemplaza `listDemandaBase`/`setDemandaBase` (kg/día por sabor) por la demanda semanal, los % por día y los % por sabor, y hace que `getDatosCierre` reciba la fecha del plan.

- [ ] **Step 1: Actualizar los tests existentes**

En `src/lib/pcp/cierre-queries.test.ts`:

1. En `limpiar()`: reemplazá `malaga.pcp_demanda_base` del `TRUNCATE` por `malaga.pcp_pct_sabor`, y después del `UPDATE malaga.pcp_config SET margen_pct = 20, dias_cobertura = 3 WHERE id = 1` dejá:

```ts
  await query(`UPDATE malaga.pcp_config SET margen_pct = 20, dias_cobertura = 3, demanda_semanal_kg = 550 WHERE id = 1`);
  await query(
    `INSERT INTO malaga.pcp_pct_dia (dia_semana, pct)
     SELECT d, CASE WHEN d <= 4 THEN 13 ELSE 16 END FROM generate_series(1, 7) AS d
     ON CONFLICT (dia_semana) DO UPDATE SET pct = EXCLUDED.pct`
  );
```

2. Agregá este helper junto a los otros (antes de los `describe`), que reemplaza al viejo `setDemandaBase(idProd, kgPorDia)` manteniendo los mismos números en todos los escenarios: demanda de **cada día** = `kgPorDia`:

```ts
// Deja la demanda de un sabor en `kgPorDia` kg para CUALQUIER día de la semana:
// semana de 100 kg, 100 % para el sabor y `kgPorDia` % para cada día.
async function configurarDemanda(idProd: number, kgPorDia: number) {
  await query(`UPDATE malaga.pcp_config SET demanda_semanal_kg = 100 WHERE id = 1`);
  await query(
    `INSERT INTO malaga.pcp_pct_sabor (id_prod, pct) VALUES ($1, 100)
     ON CONFLICT (id_prod) DO UPDATE SET pct = EXCLUDED.pct`,
    [idProd]
  );
  await query(`UPDATE malaga.pcp_pct_dia SET pct = $1`, [kgPorDia]);
}
```

3. Reemplazá **todas** las llamadas `setDemandaBase(x, n)` de los escenarios por `configurarDemanda(x, n)` y todas las llamadas `getDatosCierre()` por `getDatosCierre("2030-01-02")` (la fecha de plan que usan los escenarios). Quitá `listDemandaBase`/`setDemandaBase` de los imports.
4. Reescribí el test "listDemandaBase trae los sabores de cartilla y programados con 0 por defecto" y "setDemandaBase crea o actualiza..." (bloque "configuración y demanda base") para las funciones nuevas (ver Step 2). Y el test de `getDatosCierre` ("arma sabores, bachas y bases para la pantalla") debe esperar `demandaBaseKgDia: 10` con `configurarDemanda(pt.idProd, 10)`.

- [ ] **Step 2: Escribir los tests nuevos que fallan**

Agregá `getConfigPcp`, `updateConfigPcp`, `listPctDia`, `setPctDias`, `listPctSabor`, `setPctSabores` a los imports de `./cierre-queries` y este bloque al final del archivo:

```ts
describe("cierre queries — demanda semanal", () => {
  beforeEach(limpiar);
  afterEach(limpiar);

  it("la configuración trae la demanda semanal y se puede actualizar", async () => {
    expect((await getConfigPcp()).demandaSemanalKg).toBe(550);
    await updateConfigPcp(15, 4, 600);
    const c = await getConfigPcp();
    expect(c).toMatchObject({ margenPct: 15, diasCobertura: 4, demandaSemanalKg: 600 });
  });

  it("listPctDia devuelve 7 valores de lunes a domingo y setPctDias los guarda", async () => {
    expect(await listPctDia()).toEqual([13, 13, 13, 13, 16, 16, 16]);
    await setPctDias([10, 10, 10, 10, 20, 20, 20]);
    expect(await listPctDia()).toEqual([10, 10, 10, 10, 20, 20, 20]);
  });

  it("listPctSabor trae los sabores de la cartilla y programados con 0 por defecto", async () => {
    const actual = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const futuro = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.d_exhibidora (nro, id_prod, id_prod_fut, ts_cambio_programado) VALUES (1, $1, $2, '2099-01-01')`,
      [actual.idProd, futuro.idProd]
    );

    const filas = await listPctSabor();
    expect(filas.map((f) => [f.detalle, f.pct])).toEqual([
      ["Chocolate", 0],
      ["Vainilla", 0],
    ]);
    expect(filas[0].pesoEstandar).toBe(4);
  }, TIMEOUT_ESCENARIO);

  it("setPctSabores crea o actualiza los porcentajes", async () => {
    const a = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const b = await createProducto({ detalle: "Chocolate", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1), (2, $2)`, [a.idProd, b.idProd]);

    await setPctSabores([{ idProd: a.idProd, pct: 6 }, { idProd: b.idProd, pct: 4.5 }]);
    expect((await listPctSabor()).map((f) => f.pct)).toEqual([4.5, 6]); // Chocolate, Vainilla

    await setPctSabores([{ idProd: a.idProd, pct: 7.25 }]);
    const vainilla = (await listPctSabor()).find((f) => f.idProd === a.idProd)!;
    expect(vainilla.pct).toBe(7.25);
  }, TIMEOUT_ESCENARIO);

  it("getDatosCierre arma la demanda del día del plan y de los días siguientes", async () => {
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [pt.idProd]);
    await updateConfigPcp(20, 3, 700);
    await setPctSabores([{ idProd: pt.idProd, pct: 50 }]);

    // Jueves 2030-01-03: 700 × 50 % × 13 % = 45,5; los 3 días siguientes (vie, sáb, dom) son 16 %: 56.
    const jueves = await getDatosCierre("2030-01-03");
    expect(jueves.sabores[0].demandaBaseKgDia).toBeCloseTo(45.5, 5);
    expect(jueves.sabores[0].demandaSiguientesKg).toEqual([56, 56, 56]);

    // Lunes 2030-01-07: 45,5; los siguientes (mar, mié, jue) son 13 %: 45,5.
    const lunes = await getDatosCierre("2030-01-07");
    expect(lunes.sabores[0].demandaBaseKgDia).toBeCloseTo(45.5, 5);
    expect(lunes.sabores[0].demandaSiguientesKg).toEqual([45.5, 45.5, 45.5]);
  }, TIMEOUT_ESCENARIO);

  it("la ventana de cobertura fraccionaria incluye un día más con su peso", async () => {
    const pt = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1)`, [pt.idProd]);
    await updateConfigPcp(20, 2.5, 700);
    await setPctSabores([{ idProd: pt.idProd, pct: 100 }]);

    const datos = await getDatosCierre("2030-01-03");
    expect(datos.sabores[0].demandaSiguientesKg).toHaveLength(3);
  }, TIMEOUT_ESCENARIO);
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: FAIL (funciones/columnas nuevas inexistentes en `cierre-queries.ts`).

- [ ] **Step 4: Implementar en `src/lib/pcp/cierre-queries.ts`**

1. Imports: agregá `import { demandaDiaSabor, diaSemanaDeFecha, pesosCobertura } from "./demanda";` y asegurate de importar `sumarDias` de `./fechas` (ya se usa en `fechaValida`).
2. Reemplazá `ConfigPcp`, `getConfigPcp` y `updateConfigPcp` por:

```ts
export interface ConfigPcp {
  margenPct: number;
  diasCobertura: number;
  demandaSemanalKg: number;
}

export async function getConfigPcp(): Promise<ConfigPcp> {
  const result = await query<{ margen_pct: string; dias_cobertura: string; demanda_semanal_kg: string }>(
    `SELECT margen_pct, dias_cobertura, demanda_semanal_kg FROM malaga.pcp_config WHERE id = 1`
  );
  const row = result.rows[0];
  return {
    margenPct: Number(row.margen_pct),
    diasCobertura: Number(row.dias_cobertura),
    demandaSemanalKg: Number(row.demanda_semanal_kg),
  };
}

export async function updateConfigPcp(
  margenPct: number,
  diasCobertura: number,
  demandaSemanalKg: number
): Promise<void> {
  await query(
    `UPDATE malaga.pcp_config SET margen_pct = $1, dias_cobertura = $2, demanda_semanal_kg = $3 WHERE id = 1`,
    [margenPct, diasCobertura, demandaSemanalKg]
  );
}
```

3. **Borrá** `DemandaBaseFila`, `listDemandaBase` y `setDemandaBase`, y agregá en su lugar:

```ts
// % de cada día de la semana, de lunes (índice 0) a domingo (índice 6).
export async function listPctDia(): Promise<number[]> {
  const result = await query<{ dia_semana: number; pct: string }>(
    `SELECT dia_semana, pct FROM malaga.pcp_pct_dia ORDER BY dia_semana`
  );
  const pcts = new Array<number>(7).fill(0);
  for (const r of result.rows) pcts[r.dia_semana - 1] = Number(r.pct);
  return pcts;
}

// Guarda los 7 % de una sola vez (índice 0 = lunes).
export async function setPctDias(pcts: number[]): Promise<void> {
  await query(
    `INSERT INTO malaga.pcp_pct_dia (dia_semana, pct)
     SELECT d, p FROM unnest($1::int[], $2::numeric[]) AS t(d, p)
     ON CONFLICT (dia_semana) DO UPDATE SET pct = EXCLUDED.pct`,
    [pcts.map((_, i) => i + 1), pcts]
  );
}

export interface PctSaborFila {
  idProd: number;
  detalle: string;
  pesoEstandar: number | null;
  pct: number;
}

// Sabores en cartilla o programados a entrar, con su % de venta (0 si todavía no se cargó).
export async function listPctSabor(): Promise<PctSaborFila[]> {
  const result = await query<{ id_prod: number; detalle: string; peso_estandar: string | null; pct: string }>(
    `SELECT p.id_prod, p.detalle, p.peso_estandar, COALESCE(s.pct, 0) AS pct
     FROM malaga.d_productos p
     LEFT JOIN malaga.pcp_pct_sabor s ON s.id_prod = p.id_prod
     WHERE p.id_prod IN (
       SELECT id_prod FROM malaga.d_exhibidora
       UNION
       SELECT id_prod_fut FROM malaga.d_exhibidora WHERE id_prod_fut IS NOT NULL
     )
     ORDER BY p.detalle`
  );
  return result.rows.map((r) => ({
    idProd: r.id_prod,
    detalle: r.detalle,
    pesoEstandar: r.peso_estandar === null ? null : Number(r.peso_estandar),
    pct: Number(r.pct),
  }));
}

export async function setPctSabores(items: { idProd: number; pct: number }[]): Promise<void> {
  if (items.length === 0) return;
  await query(
    `INSERT INTO malaga.pcp_pct_sabor (id_prod, pct)
     SELECT i, p FROM unnest($1::int[], $2::numeric[]) AS t(i, p)
     ON CONFLICT (id_prod) DO UPDATE SET pct = EXCLUDED.pct`,
    [items.map((i) => i.idProd), items.map((i) => i.pct)]
  );
}
```

4. Reemplazá `getDatosCierre` (la parte que usaba `listDemandaBase`) por:

```ts
// Todo lo que necesita la pantalla de cierre para planificar `fechaPlan`. Es serializable.
export async function getDatosCierre(fechaPlan: string): Promise<DatosCierre> {
  const [config, pctSabor, pctDia, pendientes, bachasObrador, bachasExhibidas, bases] = await Promise.all([
    getConfigPcp(),
    listPctSabor(),
    listPctDia(),
    getCoccionesPendientesPorProducto(),
    listBachasObrador(),
    listBachasExhibidas(),
    getStockTeoricoBases(),
  ]);
  const itemsPorSabor = await getItemsRecetaSemiPorProducto(pctSabor.map((s) => s.idProd));

  const pctDelDia = (fecha: string) => pctDia[diaSemanaDeFecha(fecha) - 1] ?? 0;
  const diasVentana = pesosCobertura(config.diasCobertura).length;

  const sabores: SaborCierre[] = pctSabor.map((s) => ({
    idProd: s.idProd,
    detalle: s.detalle,
    pesoEstandar: s.pesoEstandar,
    demandaBaseKgDia: demandaDiaSabor(config.demandaSemanalKg, s.pct, pctDelDia(fechaPlan)),
    demandaSiguientesKg: Array.from({ length: diasVentana }, (_, k) =>
      demandaDiaSabor(config.demandaSemanalKg, s.pct, pctDelDia(sumarDias(fechaPlan, k + 1)))
    ),
    coccionesPendientes: pendientes.get(s.idProd) ?? 0,
    items: (itemsPorSabor.get(s.idProd) ?? []).map((i) => ({
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

5. En `confirmarCierre`, cambiá `const datos = await getDatosCierre();` por `const datos = await getDatosCierre(input.fechaPlan);`.

- [ ] **Step 5: Correr tests, tipos y lint**

Run: `npm run test:db -- src/lib/pcp/cierre-queries.test.ts`
Expected: PASS (todos; los escenarios con `configurarDemanda` conservan los números esperados anteriores).
Run: `npx tsc --noEmit` — Expected: errores SOLO en `src/app/(app)/pcp/{config-actions.ts,ConfigTab.tsx,page.tsx}` (usan las funciones viejas); se arreglan en el Task 6. Cualquier otro error hay que corregirlo.
Run: `npx eslint src/lib/pcp` — Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pcp/cierre-queries.ts src/lib/pcp/cierre-queries.test.ts
git commit -m "feat: armar la demanda del cierre desde la demanda semanal y los porcentajes"
```

---

### Task 6: Acciones y pestaña Configuración

**Files:**
- Modify: `src/app/(app)/pcp/config-actions.ts`
- Create: `src/app/(app)/pcp/TablaPct.tsx`
- Modify: `src/app/(app)/pcp/ConfigTab.tsx`
- Modify: `src/app/(app)/pcp/page.tsx`

- [ ] **Step 1: Acciones**

Reemplazá todo `src/app/(app)/pcp/config-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { setPctDias, setPctSabores, updateConfigPcp } from "@/lib/pcp/cierre-queries";

const TOPE = 1e8;
const MAX_DIAS_COBERTURA = 60;

export async function actualizarConfigPcpAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const margenPct = Number(formData.get("margenPct"));
  const diasCobertura = Number(formData.get("diasCobertura"));
  const demandaSemanalKg = Number(formData.get("demandaSemanalKg"));
  const valido = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  if (!valido(margenPct, TOPE) || !valido(diasCobertura, MAX_DIAS_COBERTURA) || !valido(demandaSemanalKg, TOPE)) {
    return;
  }

  await updateConfigPcp(margenPct, diasCobertura, demandaSemanalKg);
  revalidatePath("/pcp");
}

// Lee los campos `pct_<id>` del formulario. Devuelve null si alguno no es un % válido.
function leerPcts(formData: FormData): { id: number; pct: number }[] | null {
  const items: { id: number; pct: number }[] = [];
  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith("pct_")) continue;
    const id = Number(clave.slice(4));
    const pct = Number(valor);
    if (!Number.isInteger(id) || id <= 0 || String(valor).trim() === "" || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      return null;
    }
    items.push({ id, pct });
  }
  return items;
}

// Los 7 días llegan como pct_1 ... pct_7 (1 = lunes).
export async function actualizarPctDiaAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const items = leerPcts(formData);
  if (!items || items.length !== 7) return;
  const pcts = new Array<number>(7).fill(0);
  for (const { id, pct } of items) {
    if (id < 1 || id > 7) return;
    pcts[id - 1] = pct;
  }

  await setPctDias(pcts);
  revalidatePath("/pcp");
}

// Los sabores llegan como pct_<idProd>.
export async function actualizarPctSaborAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const items = leerPcts(formData);
  if (!items || items.length === 0) return;

  await setPctSabores(items.map((i) => ({ idProd: i.id, pct: i.pct })));
  revalidatePath("/pcp");
}
```

- [ ] **Step 2: Tabla de % con suma en vivo**

`src/app/(app)/pcp/TablaPct.tsx`:

```tsx
"use client";

import { useState } from "react";
import { sumaPct } from "@/lib/pcp/demanda";

export interface FilaPct {
  id: number;
  etiqueta: string;
  pct: number;
}

export function TablaPct({
  filas,
  action,
  vacio,
}: {
  filas: FilaPct[];
  action: (formData: FormData) => void | Promise<void>;
  vacio?: string;
}) {
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(filas.map((f) => [f.id, String(f.pct)]))
  );

  const suma = sumaPct(filas.map((f) => Number(valores[f.id]) || 0));
  const suma100 = Math.abs(suma - 100) < 0.005;

  if (filas.length === 0) {
    return <p className="card p-4 text-sm text-ink-soft">{vacio ?? "No hay filas."}</p>;
  }

  return (
    <form action={action} className="card flex flex-col gap-2 p-4">
      <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
        {filas.map((f) => (
          <label key={f.id} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span className="truncate">{f.etiqueta}</span>
            <span className="flex flex-none items-center gap-1">
              <input
                name={`pct_${f.id}`}
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={valores[f.id] ?? ""}
                onChange={(e) => setValores({ ...valores, [f.id]: e.target.value })}
                className="w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-base sm:text-sm"
              />
              <span className="text-xs text-ink-soft">%</span>
            </span>
          </label>
        ))}
      </div>

      <div
        role="status"
        className={`rounded-lg px-3 py-2 text-xs font-semibold ${suma100 ? "bg-ok-tint text-ok" : "bg-warn-tint text-warn"}`}
      >
        Suma: {suma.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %
        {suma100 ? "" : " — no suma 100 %, revisá los valores"}
      </div>

      <button
        type="submit"
        className="self-start rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
      >
        Guardar
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Pestaña Configuración**

Reemplazá todo `src/app/(app)/pcp/ConfigTab.tsx`:

```tsx
import { getConfigPcp, listPctDia, listPctSabor } from "@/lib/pcp/cierre-queries";
import {
  actualizarConfigPcpAction,
  actualizarPctDiaAction,
  actualizarPctSaborAction,
} from "./config-actions";
import { TablaPct } from "./TablaPct";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export async function ConfigTab() {
  const [config, pctDia, pctSabor] = await Promise.all([getConfigPcp(), listPctDia(), listPctSabor()]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Demanda, margen y cobertura</h2>
          <form action={actualizarConfigPcpAction} className="card flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1 text-sm text-ink">
              Demanda semanal pronosticada (kg)
              <input
                name="demandaSemanalKg"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={config.demandaSemanalKg}
                className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-base sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Margen de seguridad sobre la demanda (%)
              <input
                name="margenPct"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={config.margenPct}
                className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-base sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Días de cobertura de las bases
              <input
                name="diasCobertura"
                type="number"
                step="0.01"
                min="0"
                max="60"
                required
                defaultValue={config.diasCobertura}
                className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-base sm:text-sm"
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
          <h2 className="mb-3 text-sm font-semibold text-ink">% de la semana por día</h2>
          <TablaPct
            filas={DIAS.map((dia, i) => ({ id: i + 1, etiqueta: dia, pct: pctDia[i] }))}
            action={actualizarPctDiaAction}
          />
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">% de venta por sabor</h2>
        <TablaPct
          filas={pctSabor.map((s) => ({ id: s.idProd, etiqueta: s.detalle, pct: s.pct }))}
          action={actualizarPctSaborAction}
          vacio="No hay sabores en la cartilla todavía."
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Pasar la fecha del plan en `page.tsx`**

En `src/app/(app)/pcp/page.tsx`: importá `mananaEnMalaga` de `@/lib/pcp/fechas` y cambiá `getDatosCierre()` por `getDatosCierre(mananaEnMalaga())`.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` — Expected: 0 errores.
Run: `npm run lint` — Expected: 0 errores (los 4 warnings de `_prevState/_formData` en `temperaturas/actions.ts` son preexistentes).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/pcp/config-actions.ts" "src/app/(app)/pcp/TablaPct.tsx" "src/app/(app)/pcp/ConfigTab.tsx" "src/app/(app)/pcp/page.tsx"
git commit -m "feat: configurar la demanda semanal y los porcentajes por dia y por sabor"
```

---

### Task 7: Script de valores iniciales

**Files:**
- Create: `scripts/seed-pcp.ts`

- [ ] **Step 1: Escribir el script**

`scripts/seed-pcp.ts`:

```ts
import { withTransaction } from "../src/lib/db";
import { DEMANDA_SEMANAL_INICIAL, PCT_DIA_INICIAL } from "../src/lib/pcp/demanda";
import { PCT_SABORES_INICIALES, emparejarPorNombre } from "../src/lib/pcp/seed";

// Carga (de forma idempotente) la demanda semanal, los % por día y los % por sabor iniciales de PCP.
// Hay que volver a correrlo después de reimportar el catálogo (los % por sabor referencian productos).
(async () => {
  await withTransaction(async (client) => {
    const productos = await client.query<{ id_prod: number; detalle: string }>(
      `SELECT id_prod, detalle FROM malaga.d_productos WHERE tipo_producto = 'PT'`
    );
    const { encontrados, noEncontrados } = emparejarPorNombre(
      PCT_SABORES_INICIALES,
      productos.rows.map((p) => ({ idProd: p.id_prod, detalle: p.detalle }))
    );

    await client.query(`UPDATE malaga.pcp_config SET demanda_semanal_kg = $1 WHERE id = 1`, [
      DEMANDA_SEMANAL_INICIAL,
    ]);
    await client.query(
      `INSERT INTO malaga.pcp_pct_dia (dia_semana, pct)
       SELECT d, p FROM unnest($1::int[], $2::numeric[]) AS t(d, p)
       ON CONFLICT (dia_semana) DO UPDATE SET pct = EXCLUDED.pct`,
      [PCT_DIA_INICIAL.map((_, i) => i + 1), PCT_DIA_INICIAL]
    );
    if (encontrados.length > 0) {
      await client.query(
        `INSERT INTO malaga.pcp_pct_sabor (id_prod, pct)
         SELECT i, p FROM unnest($1::int[], $2::numeric[]) AS t(i, p)
         ON CONFLICT (id_prod) DO UPDATE SET pct = EXCLUDED.pct`,
        [encontrados.map((e) => e.idProd), encontrados.map((e) => e.pct)]
      );
    }

    console.log(`Demanda semanal: ${DEMANDA_SEMANAL_INICIAL} kg. % por día: ${PCT_DIA_INICIAL.join(", ")}.`);
    console.log(`Sabores cargados: ${encontrados.length} de ${PCT_SABORES_INICIALES.length}.`);
    if (noEncontrados.length > 0) {
      console.log(`SIN EMPAREJAR (revisar el nombre en el catálogo): ${noEncontrados.join("; ")}`);
    }
  });
  process.exit(0);
})();
```

- [ ] **Step 2: Probarlo contra la base**

Primero asegurate de tener el catálogo importado (`scripts/import-historico.ts` y `scripts/import-recetas.ts`; si la base está vacía, el script informa 0 sabores). Corré:

Run: `npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/seed-pcp.ts`
Expected: `Sabores cargados: N de 24.` y, si N < 24, la lista de sabores sin emparejar. **No inventes ni fuerces nombres**: si hay sabores sin emparejar, mostrá en el reporte los nombres del catálogo (`SELECT detalle FROM malaga.d_productos WHERE tipo_producto='PT' ORDER BY detalle`) para que el dueño decida. Corrélo una segunda vez y confirmá que el resultado es el mismo (idempotente).

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-pcp.ts
git commit -m "feat: agregar script para cargar los valores iniciales de PCP"
```

---

### Task 8: Verificación final

**Files:** ninguno (solo verificación; si encontrás un bug, corregilo con su test y commiteá aparte).

- [ ] **Step 1: Suite completa**

Run: `npm run test:db`
Expected: todos los archivos pasan. La suite vacía productos, recetas, exhibidora y partidas: es esperado.

- [ ] **Step 2: Lint y tipos**

Run: `npm run lint` — Expected: 0 errores. Run: `npx tsc --noEmit` — Expected: 0 errores.

- [ ] **Step 3: Restaurar catálogo y valores iniciales**

```bash
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/import-historico.ts
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/import-recetas.ts
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/seed-pcp.ts
```

Expected: 53 productos, 24 posiciones, 36 recetas, 7862 partidas y los sabores cargados (anotá cuáles quedaron sin emparejar, si alguno).

- [ ] **Step 4: Verificación manual en el navegador (cuenta de prueba)**

Levantá el servidor con `preview_start` (config `malaga-soft`; el puerto puede variar). Creá una cuenta temporal con `npm run create-user` (rol admin, `qa-temp-demanda@test.local`, contraseña aleatoria). Verificá:

1. `/pcp?tab=config`: aparecen la demanda semanal (550), el margen (20) y la cobertura (3); la tabla de días con 13/13/13/13/16/16/16 y "Suma: 100 %" en verde; la tabla de sabores con los % cargados y "Suma: 100 %".
2. Cambiar un valor de la tabla de sabores: la suma se actualiza en vivo y pasa a amarillo con el aviso; guardar y recargar: el valor persiste. Restituir el valor.
3. Cambiar la demanda semanal a 700 y guardar.
4. `/pcp` (Cierre del día): para un sabor, calculá a mano la demanda de mañana (`700 × % del sabor × % del día de mañana (13 o 16) × 1,2`) y comprobá que coincide con la columna "Demanda". Mañana es el día siguiente a hoy en hora de Málaga.
5. Calculá a mano el objetivo de una base con los días de cobertura (3): suma del consumo esperado de los 3 días siguientes al de mañana, cada uno con su %, y comprobá "Objetivo" en la tabla "Cocinar".
6. Cambiar los días de cobertura a 2,5 y guardar: el objetivo cambia como corresponde (último día a la mitad).
7. Confirmar un cierre con todo cargado: se crean las OPs sin errores; en `/ordenes` aparecen con las cantidades esperadas.
8. Sin errores en la consola del navegador.

- [ ] **Step 5: Limpieza**

Restituí la configuración (demanda semanal 550, margen 20, cobertura 3), borrá la cuenta temporal y sus sesiones (primero `malaga.sesiones`), y `TRUNCATE malaga.f_cierre_dia_base, malaga.f_cierre_dia_sabor, malaga.f_cierre_dia_bacha, malaga.f_cierre_dia CASCADE`. Volvé a correr los tres comandos del Step 3 para eliminar OPs de prueba y dejar el catálogo y los valores iniciales cargados. Confirmá que `malaga.usuarios` quedó como antes (las 8 cuentas reales más `t@t.com`), que no quedaron scripts temporales en `scripts/` (salvo `seed-pcp.ts` y los originales) y detené el servidor.

- [ ] **Step 6: Estado del repositorio**

Run: `git status --short` y `git log --oneline -10`
Expected: los commits de los Tasks 1 a 7 presentes; sin cambios sin commitear salvo `.claude/`.

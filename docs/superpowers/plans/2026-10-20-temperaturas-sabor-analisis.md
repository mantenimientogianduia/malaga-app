# Temperaturas: sabor, análisis sensorial y selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada registro de temperatura indique el sabor medido (obligatorio), el análisis sensorial/visual OK / No OK (obligatorio, con observación obligatoria si es No OK) y que la temperatura se cargue con un selector que arranca en -12,0 y sube/baja de a 0,5.

**Architecture:** Tres columnas nuevas en `f_registro_temperaturas` (sabor, análisis, observación) con un `CHECK` que exige observación en los No OK. `registrarTemperatura` pasa a recibir un objeto de detalle y valida sabor, análisis y observación en el servidor. El formulario sale de `GrillaTemperaturas.tsx` a un componente propio (`FormularioRegistro.tsx`) que maneja el estado local del selector, el sabor y el análisis; la matemática del selector es una función pura testeada.

**Tech Stack:** Next.js 16 App Router, TypeScript, Postgres con SQL crudo (`src/lib/db.ts`), node-pg-migrate, vitest (`npm run test:db`), `useActionState`.

**Spec:** `docs/superpowers/specs/2026-10-20-temperaturas-sabor-analisis-design.md`

---

## Contexto para quien implemente

- **Base de datos:** `npm run test:db` corre contra la base compartida (todavía sin datos reales; el dueño autorizó correr la suite libremente). Una corrida completa vacía productos, recetas, exhibidora y partidas: para volver a tener catálogo hay que correr los scripts de importación (Task 7). Los tests de este plan usan el usuario `t-temp@t.com` y lo borran puntualmente; **nunca** `TRUNCATE` de `malaga.usuarios`.
- **Archivos que ya existen y se modifican:** `src/lib/temperaturas/queries.ts` (+ `queries.test.ts`), `src/app/(app)/temperaturas/{actions.ts,GrillaTemperaturas.tsx,page.tsx}`, `src/app/(app)/auditoria/page.tsx`. El módulo ya tiene cierre/firma diaria y edición in-place: no cambies ese comportamiento.
- **Patrón de React obligatorio:** el proyecto tiene la regla de ESLint `react-hooks/set-state-in-effect` como error. `GrillaTemperaturas.tsx` cierra el modal al guardar con éxito comparando `state` contra `lastHandledState` **durante el render**; conservá ese patrón y no uses `useEffect` para sincronizar estado.
- **Next.js 16:** si algo de las APIs no te cierra, leé `node_modules/next/dist/docs/`.
- **Trabajo ajeno:** si hay cambios sin commitear que no son tuyos, no los toques: `git add <ruta exacta>`, nunca `git add -A` ni `git commit -a`.
- **Comandos:** un archivo de tests: `npm run test:db -- src/lib/temperaturas/queries.test.ts`; suite completa: `npm run test:db`; migraciones: `npm run migrate:up`; lint: `npm run lint`; tipos: `npx tsc --noEmit`.
- **Estilo de UI:** reutilizá las clases del módulo (`card`, `page-eyebrow`, `text-ink`, `text-ink-soft`, `bg-copper`, `bg-ok-tint`, `bg-warn-tint`, `bg-bad-tint`, `border-border`, `bg-surface-raised`).

---

## File Structure

- **Create:** `migrations/1791000000000_add-sabor-analisis-to-registro-temperaturas.js`
- **Create:** `src/lib/temperaturas/stepper.ts` + `src/lib/temperaturas/stepper.test.ts` — matemática pura del selector.
- **Modify:** `src/lib/temperaturas/queries.ts` y `queries.test.ts` — detalle del registro, `listSaboresExhibidos`, campos nuevos en las listas.
- **Modify:** `src/app/(app)/temperaturas/actions.ts` — la action lee sabor, análisis y observación.
- **Create:** `src/app/(app)/temperaturas/FormularioRegistro.tsx` — formulario (cliente).
- **Modify:** `src/app/(app)/temperaturas/GrillaTemperaturas.tsx` — usa el formulario, indicador de No OK, solo lectura ampliado.
- **Modify:** `src/app/(app)/temperaturas/page.tsx` — trae los sabores, columnas nuevas del historial.
- **Modify:** `src/app/(app)/auditoria/page.tsx` — muestra sabor y análisis.

---

### Task 1: Migración

**Files:**
- Create: `migrations/1791000000000_add-sabor-analisis-to-registro-temperaturas.js`

- [ ] **Step 1: Escribir la migración**

```js
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.f_registro_temperaturas
      ADD COLUMN id_prod INTEGER REFERENCES malaga.d_productos(id_prod),
      ADD COLUMN analisis_ok BOOLEAN,
      ADD COLUMN observacion TEXT,
      ADD CONSTRAINT chk_registro_temperaturas_observacion
        CHECK (analisis_ok IS DISTINCT FROM false OR COALESCE(length(btrim(observacion)), 0) > 0);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE malaga.f_registro_temperaturas
      DROP CONSTRAINT chk_registro_temperaturas_observacion,
      DROP COLUMN observacion,
      DROP COLUMN analisis_ok,
      DROP COLUMN id_prod;
  `);
};
```

El `COALESCE` es necesario: un `CHECK` que evalúa a NULL (observación nula) se considera cumplido en Postgres, y sin él un No OK sin observación pasaría.

- [ ] **Step 2: Aplicar la migración**

Run: `npm run migrate:up`
Expected: `1791000000000_add-sabor-analisis-to-registro-temperaturas` aplicada y `Migrations complete!`. (Si falla la conexión, revisá que `DATABASE_URL` y `PGHOST` del `.env` apunten a la base vigente.)

- [ ] **Step 3: Verificar las columnas y la restricción**

Creá `scripts/_tmp-verify.ts`:

```ts
import { query } from "../src/lib/db";
(async () => {
  const c = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'malaga' AND table_name = 'f_registro_temperaturas'
       AND column_name IN ('id_prod','analisis_ok','observacion') ORDER BY column_name`
  );
  const k = await query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE conname = 'chk_registro_temperaturas_observacion'`
  );
  console.log(c.rows.map((r) => r.column_name).join(","), k.rows.length);
  process.exit(0);
})();
```

Run: `npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/_tmp-verify.ts`
Expected: `analisis_ok,id_prod,observacion 1`. Después borrá el script.

- [ ] **Step 4: Commit**

```bash
git add migrations/1791000000000_add-sabor-analisis-to-registro-temperaturas.js
git commit -m "feat: agregar sabor, analisis y observacion a los registros de temperatura"
```

---

### Task 2: Matemática del selector de temperatura

**Files:**
- Create: `src/lib/temperaturas/stepper.ts`
- Test: `src/lib/temperaturas/stepper.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/temperaturas/stepper.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  TEMPERATURA_INICIAL,
  PASO_TEMPERATURA,
  ajustarTemperatura,
  parsearTemperatura,
} from "./stepper";

describe("selector de temperatura", () => {
  it("arranca en -12 y el paso es 0,5", () => {
    expect(TEMPERATURA_INICIAL).toBe(-12);
    expect(PASO_TEMPERATURA).toBe(0.5);
  });

  it("ajustarTemperatura sube y baja de a 0,5", () => {
    expect(ajustarTemperatura(-12, PASO_TEMPERATURA)).toBe(-11.5);
    expect(ajustarTemperatura(-12, -PASO_TEMPERATURA)).toBe(-12.5);
    expect(ajustarTemperatura(-0.5, PASO_TEMPERATURA)).toBe(0);
  });

  it("ajustarTemperatura no arrastra error de punto flotante tras muchos pasos", () => {
    let valor = TEMPERATURA_INICIAL;
    for (let i = 0; i < 20; i++) valor = ajustarTemperatura(valor, PASO_TEMPERATURA);
    expect(valor).toBe(-2);
    for (let i = 0; i < 40; i++) valor = ajustarTemperatura(valor, -PASO_TEMPERATURA);
    expect(valor).toBe(-22);
  });

  it("ajustarTemperatura acepta valores escritos a mano con un decimal", () => {
    expect(ajustarTemperatura(-12.3, PASO_TEMPERATURA)).toBe(-11.8);
    expect(ajustarTemperatura(-12.3, -PASO_TEMPERATURA)).toBe(-12.8);
  });

  it("parsearTemperatura interpreta coma y punto decimal", () => {
    expect(parsearTemperatura("-12,5")).toBe(-12.5);
    expect(parsearTemperatura("-12.5")).toBe(-12.5);
    expect(parsearTemperatura(" -13 ")).toBe(-13);
  });

  it("parsearTemperatura devuelve null si no es un número", () => {
    expect(parsearTemperatura("")).toBeNull();
    expect(parsearTemperatura("   ")).toBeNull();
    expect(parsearTemperatura("abc")).toBeNull();
    expect(parsearTemperatura("-")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test:db -- src/lib/temperaturas/stepper.test.ts`
Expected: FAIL (no se puede importar `./stepper`).

- [ ] **Step 3: Implementar**

`src/lib/temperaturas/stepper.ts`:

```ts
export const TEMPERATURA_INICIAL = -12;
export const PASO_TEMPERATURA = 0.5;

// Suma `delta` y deja un solo decimal: evita que -12 + 0,5 + 0,5 ... arrastre error de punto flotante.
export function ajustarTemperatura(actual: number, delta: number): number {
  return Math.round((actual + delta) * 10) / 10;
}

// Interpreta el texto del campo (acepta coma o punto). Devuelve null si no es un número.
export function parsearTemperatura(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test:db -- src/lib/temperaturas/stepper.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/temperaturas/stepper.ts src/lib/temperaturas/stepper.test.ts
git commit -m "feat: agregar matematica del selector de temperatura"
```

---

### Task 3: Consultas con sabor, análisis y observación

**Files:**
- Modify: `src/lib/temperaturas/queries.ts`
- Test: `src/lib/temperaturas/queries.test.ts`

- [ ] **Step 1: Preparar el archivo de tests (helpers y limpieza)**

En `src/lib/temperaturas/queries.test.ts`:

1. Agregá al import de `./queries`: `listSaboresExhibidos` y `type DetalleRegistro`, y agregá `import { createProducto } from "../productos/queries";`.
2. En el `beforeEach` del `describe`, el `TRUNCATE` pasa a incluir también la exhibidora y los productos (los registros nuevos referencian productos):

```ts
    await query(
      "TRUNCATE malaga.f_registro_temperaturas, malaga.f_cierre_temperaturas, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE"
    );
```

(dejá el `UPDATE malaga.config_temperaturas ...` que ya está a continuación).
3. Junto a `seedUser()` agregá los helpers:

```ts
  async function seedSabor(detalle = "Vainilla", nro = 1) {
    const p = await createProducto({ detalle, unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(`INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES ($1, $2)`, [nro, p.idProd]);
    return p.idProd;
  }

  function detalleOk(idProd: number): DetalleRegistro {
    return { idProd, analisisOk: true, observacion: null };
  }
```

4. **Actualizá todas las llamadas existentes** a `registrarTemperatura(...)` de este archivo: ahora reciben un cuarto argumento obligatorio. En cada test que las usa, creá antes `const idProd = await seedSabor();` y pasá `detalleOk(idProd)` como cuarto argumento (por ejemplo `registrarTemperatura(punto.idPunto, -13.5, userRegistro, detalleOk(idProd))`). Después de este paso el archivo no compila hasta que se haga el Step 3 (es esperado); `npx tsc --noEmit` te dice cada llamada que falte.

- [ ] **Step 2: Escribir los tests nuevos que fallan**

Agregá al final del `describe` (antes del `});` de cierre):

```ts
  it("registrarTemperatura guarda sabor, análisis OK y descarta la observación", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();

    const { idRegistro } = await registrarTemperatura(punto.idPunto, -12.5, userRegistro, {
      idProd,
      analisisOk: true,
      observacion: "esto se descarta",
    });

    const fila = await query<{ id_prod: number; analisis_ok: boolean; observacion: string | null }>(
      `SELECT id_prod, analisis_ok, observacion FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(fila.rows[0]).toEqual({ id_prod: idProd, analisis_ok: true, observacion: null });
  });

  it("registrarTemperatura guarda un No OK con la observación recortada", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();

    const { idRegistro } = await registrarTemperatura(punto.idPunto, -9, userRegistro, {
      idProd,
      analisisOk: false,
      observacion: "  textura arenosa  ",
    });

    const fila = await query<{ analisis_ok: boolean; observacion: string }>(
      `SELECT analisis_ok, observacion FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [idRegistro]
    );
    expect(fila.rows[0]).toEqual({ analisis_ok: false, observacion: "textura arenosa" });
  });

  it("registrarTemperatura exige el sabor", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    await expect(
      registrarTemperatura(punto.idPunto, -12, userRegistro, { idProd: 0, analisisOk: true, observacion: null })
    ).rejects.toThrow("Elegí el sabor que medís.");
  });

  it("registrarTemperatura rechaza un sabor que no está en la cartilla", async () => {
    const userRegistro = await seedUser();
    await seedSabor();
    const fuera = await createProducto({ detalle: "Frutilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    const [punto] = await listPuntos();
    await expect(
      registrarTemperatura(punto.idPunto, -12, userRegistro, { idProd: fuera.idProd, analisisOk: true, observacion: null })
    ).rejects.toThrow("Ese sabor no está en la cartilla actual.");
  });

  it("registrarTemperatura exige indicar el análisis", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    await expect(
      registrarTemperatura(punto.idPunto, -12, userRegistro, {
        idProd,
        analisisOk: undefined as unknown as boolean,
        observacion: null,
      })
    ).rejects.toThrow("Indicá el análisis sensorial/visual: OK o No OK.");
  });

  it("registrarTemperatura exige la observación cuando el análisis es No OK", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor();
    const [punto] = await listPuntos();
    for (const observacion of [null, "", "   "]) {
      await expect(
        registrarTemperatura(punto.idPunto, -12, userRegistro, { idProd, analisisOk: false, observacion })
      ).rejects.toThrow("Escribí la observación del análisis No OK.");
    }
  });

  it("la base rechaza un No OK sin observación aunque se inserte directo", async () => {
    const userRegistro = await seedUser();
    const [punto] = await listPuntos();
    for (const observacion of [null, "", "   "]) {
      await expect(
        query(
          `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, analisis_ok, observacion)
           VALUES ($1, -12, $2, false, $3)`,
          [punto.idPunto, userRegistro, observacion]
        )
      ).rejects.toThrow(/chk_registro_temperaturas_observacion/);
    }
  });

  it("editar un registro sobrescribe sabor, análisis y observación", async () => {
    const userRegistro = await seedUser();
    const vainilla = await seedSabor("Vainilla", 1);
    const chocolate = await seedSabor("Chocolate", 2);
    const [punto] = await listPuntos();

    const primero = await registrarTemperatura(punto.idPunto, -12, userRegistro, detalleOk(vainilla));
    const segundo = await registrarTemperatura(punto.idPunto, -9, userRegistro, {
      idProd: chocolate,
      analisisOk: false,
      observacion: "con cristales",
    });

    expect(segundo.idRegistro).toBe(primero.idRegistro);
    const fila = await query<{ id_prod: number; analisis_ok: boolean; observacion: string }>(
      `SELECT id_prod, analisis_ok, observacion FROM malaga.f_registro_temperaturas WHERE id_registro = $1`,
      [primero.idRegistro]
    );
    expect(fila.rows[0]).toEqual({ id_prod: chocolate, analisis_ok: false, observacion: "con cristales" });
  });

  it("listPuntosConEstadoHoy devuelve sabor, análisis y observación del registro de hoy", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor("Pistacho");
    const [p1, p2] = await listPuntos();
    await registrarTemperatura(p1.idPunto, -12, userRegistro, {
      idProd,
      analisisOk: false,
      observacion: "color apagado",
    });

    const config = await getConfigTemperaturas();
    const estado = await listPuntosConEstadoHoy(config);
    const e1 = estado.find((e) => e.idPunto === p1.idPunto)!;
    const e2 = estado.find((e) => e.idPunto === p2.idPunto)!;
    expect(e1).toMatchObject({
      idProdHoy: idProd,
      saborHoy: "Pistacho",
      analisisOkHoy: false,
      observacionHoy: "color apagado",
    });
    expect(e2).toMatchObject({ idProdHoy: null, saborHoy: null, analisisOkHoy: null, observacionHoy: null });
  });

  it("listHistorialReciente devuelve los campos nuevos y null en los registros viejos", async () => {
    const userRegistro = await seedUser();
    const idProd = await seedSabor("Pistacho");
    const [p1, p2] = await listPuntos();
    // Registro "viejo": sin sabor ni análisis.
    await query(
      `INSERT INTO malaga.f_registro_temperaturas (id_punto, temperatura, user_registro, ts_registro)
       VALUES ($1, -12, $2, now() - interval '1 hour')`,
      [p1.idPunto, userRegistro]
    );
    const { idRegistro } = await registrarTemperatura(p2.idPunto, -13, userRegistro, detalleOk(idProd));

    const config = await getConfigTemperaturas();
    const historial = await listHistorialReciente(config);
    const nuevo = historial.find((h) => h.idRegistro === idRegistro)!;
    const viejo = historial.find((h) => h.idRegistro !== idRegistro)!;
    expect(nuevo).toMatchObject({ saborDetalle: "Pistacho", analisisOk: true, observacion: null });
    expect(viejo).toMatchObject({ saborDetalle: null, analisisOk: null, observacion: null });
  });

  it("listSaboresExhibidos devuelve los sabores de la cartilla en orden de posición", async () => {
    await seedSabor("Vainilla", 3);
    await seedSabor("Chocolate", 1);
    await seedSabor("Pistacho", 2);

    const sabores = await listSaboresExhibidos();
    expect(sabores.map((s) => [s.nroPosicion, s.detalle])).toEqual([
      [1, "Chocolate"],
      [2, "Pistacho"],
      [3, "Vainilla"],
    ]);
  });
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts`
Expected: FAIL (los tests nuevos fallan por funciones/campos inexistentes; los demás pueden fallar por la firma nueva hasta implementar).

- [ ] **Step 4: Implementar en `src/lib/temperaturas/queries.ts`**

1. Reemplazá la interfaz `PuntoConEstadoHoy` y la función `listPuntosConEstadoHoy` (conservan la firma `(config: ConfigTemperaturas)`):

```ts
export interface PuntoConEstadoHoy extends PuntoTemperatura {
  registradoHoy: boolean;
  temperaturaHoy: string | null;
  fueraDeRangoHoy: boolean | null;
  idProdHoy: number | null;
  saborHoy: string | null;
  analisisOkHoy: boolean | null;
  observacionHoy: string | null;
}

export async function listPuntosConEstadoHoy(config: ConfigTemperaturas): Promise<PuntoConEstadoHoy[]> {
  const result = await query<{
    id_punto: number;
    exhibidora: number;
    lado: "obrador" | "cliente";
    posicion: "izquierda" | "derecha";
    detalle: string;
    temperatura: string | null;
    id_prod: number | null;
    sabor_detalle: string | null;
    analisis_ok: boolean | null;
    observacion: string | null;
  }>(
    `SELECT p.id_punto, p.exhibidora, p.lado, p.posicion, p.detalle, r.temperatura,
            r.id_prod, s.detalle AS sabor_detalle, r.analisis_ok, r.observacion
     FROM malaga.d_puntos_temperatura p
     LEFT JOIN malaga.f_registro_temperaturas r ON r.id_punto = p.id_punto AND r.fecha = CURRENT_DATE
     LEFT JOIN malaga.d_productos s ON s.id_prod = r.id_prod
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
    idProdHoy: r.id_prod,
    saborHoy: r.sabor_detalle,
    analisisOkHoy: r.analisis_ok,
    observacionHoy: r.observacion,
  }));
}
```

2. Reemplazá `registrarTemperatura` (agregá el tipo `DetalleRegistro` justo arriba):

```ts
export interface DetalleRegistro {
  idProd: number;
  analisisOk: boolean;
  observacion: string | null;
}

export async function registrarTemperatura(
  idPunto: number,
  temperatura: number,
  userRegistro: number,
  detalle: DetalleRegistro
): Promise<{ idRegistro: number }> {
  if (!Number.isInteger(detalle.idProd) || detalle.idProd <= 0) {
    throw new Error("Elegí el sabor que medís.");
  }
  if (typeof detalle.analisisOk !== "boolean") {
    throw new Error("Indicá el análisis sensorial/visual: OK o No OK.");
  }
  const observacion = (detalle.observacion ?? "").trim();
  if (!detalle.analisisOk && observacion === "") {
    throw new Error("Escribí la observación del análisis No OK.");
  }

  const cierre = await query(`SELECT 1 FROM malaga.f_cierre_temperaturas WHERE fecha = CURRENT_DATE`);
  if (cierre.rows.length > 0) {
    throw new Error("El día ya está cerrado y firmado. Reabrilo para poder cargar o editar.");
  }

  const enCartilla = await query(`SELECT 1 FROM malaga.d_exhibidora WHERE id_prod = $1 LIMIT 1`, [detalle.idProd]);
  if (enCartilla.rows.length === 0) {
    throw new Error("Ese sabor no está en la cartilla actual.");
  }

  const result = await query<{ id_registro: number }>(
    `INSERT INTO malaga.f_registro_temperaturas
       (id_punto, temperatura, user_registro, id_prod, analisis_ok, observacion)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id_punto, fecha) DO UPDATE
       SET temperatura = EXCLUDED.temperatura, ts_registro = now(), user_registro = EXCLUDED.user_registro,
           id_prod = EXCLUDED.id_prod, analisis_ok = EXCLUDED.analisis_ok, observacion = EXCLUDED.observacion
     RETURNING id_registro`,
    [idPunto, temperatura, userRegistro, detalle.idProd, detalle.analisisOk, detalle.analisisOk ? null : observacion]
  );
  return { idRegistro: result.rows[0].id_registro };
}
```

3. Reemplazá `RegistroTemperatura` y `listHistorialReciente` (conservan la firma `(config, limite = 40)`):

```ts
export interface RegistroTemperatura {
  idRegistro: number;
  puntoDetalle: string;
  temperatura: string;
  tsRegistro: string;
  userRegistro: string | null;
  fueraDeRango: boolean;
  saborDetalle: string | null;
  analisisOk: boolean | null;
  observacion: string | null;
}

export async function listHistorialReciente(
  config: ConfigTemperaturas,
  limite = 40
): Promise<RegistroTemperatura[]> {
  const result = await query<{
    id_registro: number;
    punto_detalle: string;
    temperatura: string;
    ts_registro: string;
    user_registro: string | null;
    sabor_detalle: string | null;
    analisis_ok: boolean | null;
    observacion: string | null;
  }>(
    `SELECT r.id_registro, p.detalle AS punto_detalle, r.temperatura,
            r.ts_registro::text AS ts_registro, u.email AS user_registro,
            s.detalle AS sabor_detalle, r.analisis_ok, r.observacion
     FROM malaga.f_registro_temperaturas r
     JOIN malaga.d_puntos_temperatura p ON p.id_punto = r.id_punto
     LEFT JOIN malaga.usuarios u ON u.id_user = r.user_registro
     LEFT JOIN malaga.d_productos s ON s.id_prod = r.id_prod
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
    saborDetalle: r.sabor_detalle,
    analisisOk: r.analisis_ok,
    observacion: r.observacion,
  }));
}
```

4. Agregá `listSaboresExhibidos` (por ejemplo después de `listPuntos`):

```ts
export interface SaborExhibido {
  idProd: number;
  nroPosicion: number;
  detalle: string;
}

// Sabores de la cartilla actual, ordenados por posición en la exhibidora.
export async function listSaboresExhibidos(): Promise<SaborExhibido[]> {
  const result = await query<{ id_prod: number; nro: number; detalle: string }>(
    `SELECT p.id_prod, e.nro, p.detalle
     FROM malaga.d_exhibidora e
     JOIN malaga.d_productos p ON p.id_prod = e.id_prod
     ORDER BY e.nro`
  );
  return result.rows.map((r) => ({ idProd: r.id_prod, nroPosicion: r.nro, detalle: r.detalle }));
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm run test:db -- src/lib/temperaturas/queries.test.ts`
Expected: PASS (los tests anteriores adaptados más los 11 nuevos).
Run: `npx tsc --noEmit` — Expected: errores SOLO en `src/app/(app)/temperaturas/actions.ts` (la action todavía llama a `registrarTemperatura` con 3 argumentos); se arregla en el Task 4. Si hay errores en otros archivos, corregilos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/temperaturas/queries.ts src/lib/temperaturas/queries.test.ts
git commit -m "feat: registrar sabor, analisis y observacion en las temperaturas"
```

---

### Task 4: Server action

**Files:**
- Modify: `src/app/(app)/temperaturas/actions.ts`

- [ ] **Step 1: Reemplazar `registrarTemperaturaAction`**

En `src/app/(app)/temperaturas/actions.ts`, reemplazá la función `registrarTemperaturaAction` completa por (no toques las demás acciones del archivo):

```ts
export async function registrarTemperaturaAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPunto = Number(formData.get("idPunto"));
  const temperatura = Number(formData.get("temperatura"));
  const idProd = Number(formData.get("idProd"));
  const analisis = String(formData.get("analisis") ?? "");
  const observacion = String(formData.get("observacion") ?? "");

  if (!idPunto || String(formData.get("temperatura") ?? "").trim() === "" || Number.isNaN(temperatura)) {
    return { error: "Completá la temperatura." };
  }
  if (!idProd) {
    return { error: "Elegí el sabor que medís." };
  }
  if (analisis !== "ok" && analisis !== "no_ok") {
    return { error: "Indicá el análisis sensorial/visual: OK o No OK." };
  }

  try {
    await registrarTemperatura(idPunto, temperatura, user.idUser, {
      idProd,
      analisisOk: analisis === "ok",
      observacion: observacion.trim() === "" ? null : observacion,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo registrar la temperatura." };
  }

  revalidatePath("/temperaturas");
  revalidatePath("/");
  return {};
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc --noEmit` — Expected: 0 errores.
Run: `npx eslint "src/app/(app)/temperaturas/actions.ts"` — Expected: 0 errores (warnings de parámetros no usados que ya existían en otras acciones del archivo son esperables).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/temperaturas/actions.ts"
git commit -m "feat: leer sabor, analisis y observacion en la accion de registrar temperatura"
```

---

### Task 5: Formulario con selector, sabor y análisis

**Files:**
- Create: `src/app/(app)/temperaturas/FormularioRegistro.tsx`
- Modify: `src/app/(app)/temperaturas/GrillaTemperaturas.tsx`
- Modify: `src/app/(app)/temperaturas/page.tsx`

- [ ] **Step 1: Crear el formulario**

`src/app/(app)/temperaturas/FormularioRegistro.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { PuntoConEstadoHoy, SaborExhibido } from "@/lib/temperaturas/queries";
import {
  PASO_TEMPERATURA,
  TEMPERATURA_INICIAL,
  ajustarTemperatura,
  parsearTemperatura,
} from "@/lib/temperaturas/stepper";

type Analisis = "ok" | "no_ok" | null;

export function FormularioRegistro({
  punto,
  sabores,
  tempMin,
  tempMax,
  error,
  pending,
  formAction,
}: {
  punto: PuntoConEstadoHoy;
  sabores: SaborExhibido[];
  tempMin: string;
  tempMax: string;
  error?: string;
  pending: boolean;
  formAction: (payload: FormData) => void;
}) {
  const [idProd, setIdProd] = useState(punto.idProdHoy !== null ? String(punto.idProdHoy) : "");
  const [temperatura, setTemperatura] = useState(punto.temperaturaHoy ?? TEMPERATURA_INICIAL.toFixed(1));
  const [analisis, setAnalisis] = useState<Analisis>(
    punto.analisisOkHoy === null ? null : punto.analisisOkHoy ? "ok" : "no_ok"
  );
  const [observacion, setObservacion] = useState(punto.observacionHoy ?? "");

  const valor = parsearTemperatura(temperatura);
  const mover = (delta: number) =>
    setTemperatura(ajustarTemperatura(valor ?? TEMPERATURA_INICIAL, delta).toFixed(1));

  const completo =
    idProd !== "" && valor !== null && analisis !== null && (analisis === "ok" || observacion.trim() !== "");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="idPunto" value={punto.idPunto} />
      <input type="hidden" name="analisis" value={analisis ?? ""} />

      <label className="flex flex-col gap-1 text-sm text-ink">
        Sabor
        <select
          name="idProd"
          required
          value={idProd}
          onChange={(e) => setIdProd(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <option value="">Elegí el sabor que medís...</option>
          {sabores.map((s) => (
            <option key={s.nroPosicion} value={s.idProd}>
              {s.nroPosicion} · {s.detalle}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm text-ink">
        Temperatura (°C)
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            aria-label={`Bajar ${PASO_TEMPERATURA} grados`}
            onClick={() => mover(-PASO_TEMPERATURA)}
            className="h-11 w-11 flex-none rounded-md border border-border text-lg font-semibold text-ink transition-colors hover:border-copper hover:text-copper"
          >
            −
          </button>
          <input
            name="temperatura"
            type="number"
            step="0.1"
            required
            value={temperatura}
            onChange={(e) => setTemperatura(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-center font-mono text-lg"
          />
          <button
            type="button"
            aria-label={`Subir ${PASO_TEMPERATURA} grados`}
            onClick={() => mover(PASO_TEMPERATURA)}
            className="h-11 w-11 flex-none rounded-md border border-border text-lg font-semibold text-ink transition-colors hover:border-copper hover:text-copper"
          >
            +
          </button>
        </div>
        <p className="text-[11px] text-ink-soft">
          Rango normal: {tempMin}°C a {tempMax}°C
        </p>
      </div>

      <div className="flex flex-col gap-1 text-sm text-ink">
        Análisis sensorial / visual
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={analisis === "ok"}
            onClick={() => setAnalisis("ok")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              analisis === "ok"
                ? "border-ok bg-ok-tint text-ok"
                : "border-border text-ink hover:border-ok hover:text-ok"
            }`}
          >
            OK
          </button>
          <button
            type="button"
            aria-pressed={analisis === "no_ok"}
            onClick={() => setAnalisis("no_ok")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              analisis === "no_ok"
                ? "border-bad bg-bad-tint text-bad"
                : "border-border text-ink hover:border-bad hover:text-bad"
            }`}
          >
            No OK
          </button>
        </div>
      </div>

      {analisis === "no_ok" && (
        <label className="flex flex-col gap-1 text-sm text-ink">
          Observación
          <textarea
            name="observacion"
            required
            rows={3}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="¿Qué observaste?"
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}

      <button
        type="submit"
        disabled={pending || !completo}
        className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Usar el formulario en `GrillaTemperaturas.tsx`**

Cambios en `src/app/(app)/temperaturas/GrillaTemperaturas.tsx`:

1. Imports: cambiá la línea de tipos por `import type { PuntoConEstadoHoy, SaborExhibido } from "@/lib/temperaturas/queries";` y agregá `import { FormularioRegistro } from "./FormularioRegistro";`.
2. En `Celda`, el botón pasa a ser `relative` y muestra un indicador cuando el análisis fue No OK. Reemplazá el `return` del botón por:

```tsx
  return (
    <button
      type="button"
      onClick={() => onTap?.(punto.idPunto)}
      className={`relative flex h-12 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
        punto.registradoHoy
          ? punto.fueraDeRangoHoy
            ? "border-bad bg-bad-tint text-bad"
            : "border-ok bg-ok-tint text-ok"
          : "border-warn bg-warn-tint text-warn hover:border-copper"
      }`}
    >
      {punto.registradoHoy ? `${punto.temperaturaHoy}°` : "Medir"}
      {punto.analisisOkHoy === false && (
        <span
          title="Análisis No OK"
          className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-bad text-[9px] font-bold text-white"
        >
          !
        </span>
      )}
    </button>
  );
```

3. La firma de `GrillaTemperaturas` recibe `sabores: SaborExhibido[]` (agregalo al destructuring y al tipo de props).
4. Reemplazá el bloque `<form key={abierto.idPunto} ...> ... </form>` completo (la rama `mostrarForm ? (...)`) por:

```tsx
              <FormularioRegistro
                key={abierto.idPunto}
                punto={abierto}
                sabores={sabores}
                tempMin={tempMin}
                tempMax={tempMax}
                error={state?.error}
                pending={pending}
                formAction={formAction}
              />
```

5. Reemplazá la rama de solo lectura de un punto registrado (el `<div className={\`rounded-lg p-3 text-sm ...\`}>` que muestra la temperatura) por:

```tsx
              <div className="flex flex-col gap-2">
                <div
                  className={`rounded-lg p-3 text-sm ${
                    abierto.fueraDeRangoHoy ? "bg-bad-tint text-bad" : "bg-ok-tint text-ok"
                  }`}
                >
                  {abierto.temperaturaHoy}°C
                  {abierto.fueraDeRangoHoy ? " — fuera del rango normal" : " — dentro del rango normal"}
                </div>
                <div className="flex flex-col gap-0.5 text-sm text-ink">
                  <p>
                    <span className="text-ink-soft">Sabor: </span>
                    {abierto.saborHoy ?? "—"}
                  </p>
                  <p>
                    <span className="text-ink-soft">Análisis: </span>
                    {abierto.analisisOkHoy === null ? "—" : abierto.analisisOkHoy ? "OK" : "No OK"}
                  </p>
                  {abierto.analisisOkHoy === false && (
                    <p>
                      <span className="text-ink-soft">Observación: </span>
                      {abierto.observacionHoy}
                    </p>
                  )}
                </div>
              </div>
```

Conservá intacto el patrón `lastHandledState` (ajuste de estado durante el render) y el resto del componente.

- [ ] **Step 3: Pasar los sabores desde `page.tsx`**

En `src/app/(app)/temperaturas/page.tsx`: importá `listSaboresExhibidos` junto a las otras funciones de `@/lib/temperaturas/queries`; en el `Promise.all` agregá `listSaboresExhibidos()` y desestructurá como `sabores`:

```tsx
  const config = await getConfigTemperaturas();
  const [puntos, historial, resumen, cierre, sabores] = await Promise.all([
    listPuntosConEstadoHoy(config),
    listHistorialReciente(config),
    getResumen30Dias(config),
    getCierreHoy(),
    listSaboresExhibidos(),
  ]);
```

y pasá la prop: `<GrillaTemperaturas puntos={puntos} sabores={sabores} tempMin={config.tempMin} tempMax={config.tempMax} cerrado={cierre !== null} />`.

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit` — Expected: 0 errores.
Run: `npx eslint "src/app/(app)/temperaturas"` — Expected: 0 errores, y en particular ningún `react-hooks/set-state-in-effect` (el formulario no usa `useEffect`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/temperaturas/FormularioRegistro.tsx" "src/app/(app)/temperaturas/GrillaTemperaturas.tsx" "src/app/(app)/temperaturas/page.tsx"
git commit -m "feat: formulario de temperatura con sabor, analisis y selector de 0,5"
```

---

### Task 6: Historial y Auditoría

**Files:**
- Modify: `src/app/(app)/temperaturas/page.tsx` (tabla "Historial reciente")
- Modify: `src/app/(app)/auditoria/page.tsx` (sección "Registros de temperatura recientes")

- [ ] **Step 1: Columnas nuevas en el historial de `/temperaturas`**

Leé la tabla "Historial reciente" de `src/app/(app)/temperaturas/page.tsx` y aplicá estos cambios:

1. En el `<thead>`, después de `<th ...>Temperatura</th>` agregá (mismas clases que las otras `th`):

```tsx
                <th className="px-3.5 py-2.5">Sabor</th>
                <th className="px-3.5 py-2.5">Análisis</th>
```

2. En cada fila, después de la celda de la temperatura (`{h.temperatura}°C`) agregá:

```tsx
                  <td className="px-3.5 py-2.5 text-ink-soft">{h.saborDetalle ?? "—"}</td>
                  <td className="px-3.5 py-2.5">
                    {h.analisisOk === null ? (
                      <span className="text-ink-soft">—</span>
                    ) : h.analisisOk ? (
                      <span className="text-ok">OK</span>
                    ) : (
                      <span className="text-bad">
                        No OK
                        {h.observacion ? <span className="text-ink-soft"> — {h.observacion}</span> : null}
                      </span>
                    )}
                  </td>
```

3. En la fila "Todavía no hay registros." cambiá `colSpan={4}` por `colSpan={6}`.

- [ ] **Step 2: Sabor y análisis en Auditoría**

En `src/app/(app)/auditoria/page.tsx`, dentro del `registrosTemperatura.map`, justo después del `<div className="font-mono text-[10.5px] text-ink-soft">...</div>` que muestra temperatura/hora/usuario, agregá:

```tsx
                {r.saborDetalle && (
                  <div className="truncate text-[10.5px] text-ink-soft">
                    {r.saborDetalle} · análisis {r.analisisOk ? "OK" : "No OK"}
                    {r.analisisOk === false && r.observacion ? ` — ${r.observacion}` : ""}
                  </div>
                )}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit` — Expected: 0 errores.
Run: `npx eslint "src/app/(app)/temperaturas/page.tsx" "src/app/(app)/auditoria/page.tsx"` — Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/temperaturas/page.tsx" "src/app/(app)/auditoria/page.tsx"
git commit -m "feat: mostrar sabor y analisis en el historial y en auditoria"
```

---

### Task 7: Verificación final

**Files:** ninguno (solo verificación; si encontrás un bug, corregilo con su test y commiteá aparte).

- [ ] **Step 1: Suite completa**

Run: `npm run test:db`
Expected: todos los archivos pasan. La suite vacía productos, recetas, exhibidora y partidas de la base compartida: es esperado.

- [ ] **Step 2: Lint y tipos**

Run: `npm run lint` — Expected: 0 errores. Run: `npx tsc --noEmit` — Expected: 0 errores.

- [ ] **Step 3: Restaurar el catálogo para probar en el navegador**

```bash
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/import-historico.ts
npx cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/import-recetas.ts
```

Expected: 53 productos, 24 posiciones de exhibidora, 36 recetas, "Importación completa".

- [ ] **Step 4: Verificación manual en el navegador (cuenta de prueba)**

Levantá el servidor con `preview_start` (config `malaga-soft`). Creá una cuenta temporal con `npm run create-user` (rol `admin`, email `qa-temp-sabor@test.local`, contraseña aleatoria). Si el día de hoy ya está cerrado, reabrilo primero. En `/temperaturas`:

1. Tocar un punto sin cargar: el formulario muestra Sabor (vacío), Temperatura en **-12,0**, análisis sin elegir, y "Guardar" deshabilitado.
2. Tocar **+** tres veces: -10,5; **−** cinco veces: -13,0. Escribir a mano `-13,7` y tocar **+**: -13,2.
3. Elegir un sabor y **OK**: "Guardar" se habilita; guardar. La celda queda verde/rojo según el rango y sin indicador.
4. Tocar otro punto, elegir sabor y **No OK**: aparece el campo Observación y "Guardar" sigue deshabilitado hasta escribir algo. Guardar: la celda muestra el indicador "!".
5. Volver a tocar ese punto: el formulario aparece precargado (sabor, temperatura, No OK, observación). Cambiar a OK y guardar: desaparece el indicador y la observación se descarta.
6. Cerrar el día: el modal de un punto cargado es de solo lectura y muestra sabor, análisis y (si es No OK) observación.
7. El historial de `/temperaturas` y la lista de `/auditoria` muestran sabor y análisis; los registros anteriores muestran "—".
8. Sin errores en la consola del navegador.

- [ ] **Step 5: Limpieza**

Reabrí el día si lo cerraste, borrá los registros de temperatura de la prueba, la cuenta temporal y sus sesiones (`malaga.sesiones` primero), y confirmá con una consulta que `malaga.usuarios` quedó como antes (las 8 cuentas reales más `t@t.com`). Verificá que no quedaron scripts temporales en `scripts/`.

- [ ] **Step 6: Estado del repositorio**

Run: `git status --short` y `git log --oneline -10`
Expected: los commits de los Tasks 1 a 6 presentes; sin cambios sin commitear salvo `.claude/`.

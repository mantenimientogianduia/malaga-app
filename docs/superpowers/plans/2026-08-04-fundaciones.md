# Malaga Soft — Fase 1: Fundaciones (scaffold, esquema de datos, conexión) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar listo el esqueleto de Malaga Soft — proyecto Next.js/TypeScript, conexión a PostgreSQL (esquema `malaga` aislado en el mismo servidor que G360), y el esquema de datos completo de v1 (tablas + vistas) creado vía migraciones versionadas y probadas.

**Architecture:** App web full-stack única en Next.js (App Router) + TypeScript. Acceso a datos vía `pg` (node-postgres) con pool de conexión, `search_path` fijado al esquema `malaga`. Migraciones con `node-pg-migrate` en SQL crudo (mismo estilo de SQL calificado que ya usan en G360). Sin ORM: las consultas se escriben a mano en módulos de acceso a datos, porque el modelo tiene vistas con lógica de vigencia (ventanas/agregaciones) que no mapean bien a un ORM genérico.

**Tech Stack:** Node.js 20+, Next.js 14 (App Router), TypeScript, `pg`, `node-pg-migrate`, Vitest, Tailwind CSS (solo para estilos de las pantallas, no forma parte del acceso a datos).

**No cubre esta fase:** autenticación, endpoints de negocio, UI de módulos. Eso son fases siguientes (planes separados), una vez que este esqueleto esté revisado y funcionando.

---

## Prerrequisito manual (fuera del código, lo hace un admin de la base)

Antes de correr cualquier migración, alguien con acceso de superusuario al servidor PostgreSQL que aloja `gianduia360-bbdd` debe crear el esquema y el rol dedicados a Malaga Soft, aislados de `g360`:

```sql
CREATE SCHEMA IF NOT EXISTS malaga;

CREATE ROLE malaga_app WITH LOGIN PASSWORD 'REEMPLAZAR_POR_PASSWORD_SEGURO';

GRANT USAGE, CREATE ON SCHEMA malaga TO malaga_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA malaga TO malaga_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA malaga GRANT ALL PRIVILEGES ON TABLES TO malaga_app;

-- Verificación explícita: malaga_app NO debe tener ningún permiso sobre g360
REVOKE ALL ON SCHEMA g360 FROM malaga_app;
```

Guardar el password generado en el gestor de secretos que uses (no en el repo). El resto de este plan asume que `PGUSER=malaga_app` y que ese rol solo puede tocar el esquema `malaga`.

**Notas de conexión específicas de Google Cloud SQL (confirmado ejecutando esta fase contra la base real):**

1. **CA del servidor.** Cloud SQL firma su certificado con una CA propia. Descargarla desde la consola (instancia → **Connections** → **Security** → certificado del servidor) y guardarla como `malaga-soft/certs/server-ca.pem` (ya cubierto por `*.pem` en `.gitignore`, no se commitea). Para que Node la confíe, correr los comandos que tocan la base con `NODE_EXTRA_CA_CERTS` apuntando a ese archivo — nunca desactivar `rejectUnauthorized`.
2. **Verificación de hostname.** El certificado de Cloud SQL está emitido para un nombre interno (`*.sql.goog`), no para la IP pública. Conectando directo por IP (sin el Cloud SQL Auth Proxy), la verificación estricta de hostname (`sslmode=require` tratado como `verify-full`) siempre falla con `ERR_TLS_CERT_ALTNAME_INVALID`. Dos ajustes, ambos mantienen la validación de la cadena de certificado contra la CA — solo se salta la comparación de hostname:
   - En `DATABASE_URL` (usado por `node-pg-migrate`): agregar `uselibpqcompat=true` a la query string, ej. `...?uselibpqcompat=true&sslmode=require`.
   - En `src/lib/db.ts` (usado por la app, con `ssl` como objeto en vez de connection string): agregar `checkServerIdentity: () => undefined` junto a `rejectUnauthorized: true`.
3. **Esquema de las migraciones.** `node-pg-migrate` intenta crear su tabla de control (`pgmigrations`) en el esquema `public` por defecto — y `malaga_app` no tiene permisos ahí (correcto, es el aislamiento funcionando). Los scripts `migrate:up`/`migrate:down` deben incluir `--schema malaga`.
4. **Tests de integración en serie.** Como pegan contra la misma base compartida real (no hay una base de test descartable), correr los archivos de test en paralelo produce deadlocks y datos pisados entre tests. `vitest.config.ts` debe tener `fileParallelism: false`.

---

### Task 1: Scaffold del proyecto Next.js + TypeScript

**Files:**
- Create: todo el árbol generado por `create-next-app` en `malaga-soft/`
- Modify: `malaga-soft/.gitignore` (agregar `.env`, `.env.local`)

- [ ] **Step 1: Generar el proyecto**

Run (desde `C:\Users\Usuario\Desktop\Malaga\malaga-soft`, que ya tiene `.git` y `docs/`):

```bash
npx create-next-app@latest . --typescript --eslint --app --src-dir --import-alias "@/*" --tailwind --no-turbopack
```

Cuando pregunte si la carpeta no está vacía, confirmar que sí (solo contiene `.git/` y `docs/`, no hay conflicto de archivos).

- [ ] **Step 2: Verificar que levanta**

Run: `npm run dev`
Expected: servidor en `http://localhost:3000` sirviendo la página default de Next.js. Parar el servidor con Ctrl+C.

- [ ] **Step 3: Confirmar `.gitignore`**

Verificar que `malaga-soft/.gitignore` (generado por create-next-app) ya incluye `.env*.local`. Agregar explícitamente estas líneas si no están:

```
.env
.env.local
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript project"
```

---

### Task 2: Variables de entorno y plantilla `.env.example`

**Files:**
- Create: `malaga-soft/.env.example`

- [ ] **Step 1: Crear la plantilla de variables de entorno**

```bash
# malaga-soft/.env.example

# Conexión a PostgreSQL (mismo servidor que gianduia360-bbdd, esquema/rol aislado)
PGHOST=
PGPORT=5432
PGDATABASE=gianduia360-bbdd
PGUSER=malaga_app
PGPASSWORD=
PGSSLMODE=require
# Ruta al certificado de la CA si el servidor usa TLS autofirmado (no dejar vacío en ese caso;
# nunca desactivar la verificación de certificado en el código)
PGSSLROOTCERT=
PG_SCHEMA=malaga

# Usado directamente por node-pg-migrate
DATABASE_URL=postgres://malaga_app:REEMPLAZAR@HOST:5432/gianduia360-bbdd?sslmode=require

# Sesiones (Fase 2 - auth), generar con: openssl rand -base64 32
SESSION_SECRET=
```

- [ ] **Step 2: Crear tu copia local**

Run:
```bash
cp .env.example .env
```
Completar `PGHOST`, `PGPASSWORD` y `DATABASE_URL` con las credenciales reales del rol `malaga_app` creado en el prerrequisito. `.env` no se commitea (ya está en `.gitignore`).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add environment variable template"
```

---

### Task 3: Módulo de conexión a PostgreSQL

**Files:**
- Create: `src/lib/db.ts`
- Test: `src/lib/db.test.ts`

- [ ] **Step 1: Escribir el test (requiere `.env` con credenciales reales cargadas)**

```typescript
// src/lib/db.test.ts
import { describe, it, expect } from 'vitest';
import { query } from './db';

describe('db connection', () => {
  it('connects and runs a query against the malaga schema', async () => {
    const result = await query<{ schema: string }>('SELECT current_schema() AS schema');
    expect(result.rows[0].schema).toBe('malaga');
  });
});
```

- [ ] **Step 2: Instalar dependencias**

```bash
npm install pg
npm install -D vitest @types/pg dotenv-cli
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/db.test.ts`
Expected: FAIL con `Cannot find module './db'`

- [ ] **Step 4: Implementar el módulo de conexión**

```typescript
// src/lib/db.ts
import { Pool, QueryResultRow } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  // Verificación de certificado SIEMPRE activa. Si el servidor usa un certificado
  // autofirmado, no desactivar rejectUnauthorized: en cambio, apuntar PGSSLROOTCERT
  // al archivo de la CA y cargarlo acá (fs.readFileSync(process.env.PGSSLROOTCERT)).
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : undefined,
  options: `-c search_path=${process.env.PG_SCHEMA ?? 'malaga'}`,
});

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Configurar Vitest para cargar `.env`**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

```typescript
// vitest.setup.ts
import { config } from 'dotenv';
config({ path: '.env' });
```

Run: `npm install -D dotenv`

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS (requiere `.env` con conexión real válida al esquema `malaga`)

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts vitest.config.ts vitest.setup.ts package.json package-lock.json
git commit -m "feat: add PostgreSQL connection pool scoped to malaga schema"
```

---

### Task 4: Configurar `node-pg-migrate`

**Files:**
- Modify: `package.json` (scripts)
- Create: `migrations/` (carpeta vacía, la llenan las próximas tasks)

- [ ] **Step 1: Instalar**

```bash
npm install -D node-pg-migrate
```

- [ ] **Step 2: Agregar scripts a `package.json`**

```json
{
  "scripts": {
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down",
    "migrate:create": "node-pg-migrate create"
  }
}
```

- [ ] **Step 3: Verificar que corre sin migraciones**

Run: `npm run migrate:up`
Expected: mensaje indicando que no hay migraciones pendientes (0 migrations to run), y que crea la tabla de control `pgmigrations` dentro del esquema `malaga`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json migrations/.gitkeep
git commit -m "chore: configure node-pg-migrate"
```

(Si `migrations/` queda vacía y git no la trackea, crear `migrations/.gitkeep` con contenido vacío antes del commit.)

---

### Task 5: Migración — tabla `usuarios`

**Files:**
- Create: `migrations/<timestamp>_create-usuarios.js`

- [ ] **Step 1: Generar el archivo de migración**

Run: `npm run migrate:create -- create-usuarios`

- [ ] **Step 2: Escribir la migración**

```javascript
// migrations/<timestamp>_create-usuarios.js
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.usuarios (
      id_user SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('produccion', 'gestion', 'admin')),
      activo BOOLEAN NOT NULL DEFAULT true,
      fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.usuarios;`);
};
```

- [ ] **Step 3: Correr la migración**

Run: `npm run migrate:up`
Expected: `usuarios` creada, sin errores.

- [ ] **Step 4: Verificar y hacer rollback de prueba**

Run: `npm run migrate:down` y después `npm run migrate:up` de nuevo.
Expected: ambos comandos corren sin error (confirma que `down` es correcto).

- [ ] **Step 5: Commit**

```bash
git add migrations/
git commit -m "feat(db): create usuarios table"
```

---

### Task 6: Migración — tabla `d_productos`

**Files:**
- Create: `migrations/<timestamp>_create-d-productos.js`

- [ ] **Step 1: Generar y escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.d_productos (
      id_prod SERIAL PRIMARY KEY,
      detalle TEXT NOT NULL,
      sector TEXT,
      familia TEXT,
      unid_med TEXT NOT NULL,
      tipo_producto TEXT NOT NULL CHECK (tipo_producto IN ('PT', 'SEMI')),
      peso_estandar NUMERIC(12,3) CHECK (peso_estandar IS NULL OR peso_estandar > 0),
      activo BOOLEAN NOT NULL DEFAULT true,
      CONSTRAINT peso_estandar_obligatorio_pt
        CHECK (tipo_producto <> 'PT' OR peso_estandar IS NOT NULL)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.d_productos;`);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "feat(db): create d_productos table"
```

---

### Task 7: Migración — tablas `recetas` y `recetas_detalles`

**Files:**
- Create: `migrations/<timestamp>_create-recetas.js`

- [ ] **Step 1: Escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.recetas (
      id_receta SERIAL PRIMARY KEY,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      version INTEGER NOT NULL,
      activa BOOLEAN NOT NULL DEFAULT true,
      fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_alta INTEGER REFERENCES malaga.usuarios(id_user),
      UNIQUE (id_prod, version)
    );

    CREATE TABLE malaga.recetas_detalles (
      id_det_receta SERIAL PRIMARY KEY,
      id_receta INTEGER NOT NULL REFERENCES malaga.recetas(id_receta),
      id_prod_padre INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      id_subprod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      cant_subprod NUMERIC(12,3) NOT NULL CHECK (cant_subprod > 0)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE malaga.recetas_detalles;
    DROP TABLE malaga.recetas;
  `);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "feat(db): create recetas and recetas_detalles tables"
```

---

### Task 8: Migración — tabla `d_exhibidora`

**Files:**
- Create: `migrations/<timestamp>_create-d-exhibidora.js`

- [ ] **Step 1: Escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.d_exhibidora (
      id_exhibidora SERIAL PRIMARY KEY,
      nro INTEGER NOT NULL CHECK (nro BETWEEN 1 AND 24),
      sucursal TEXT NOT NULL DEFAULT 'malaga-centro',
      id_prod INTEGER REFERENCES malaga.d_productos(id_prod),
      id_prod_ant INTEGER REFERENCES malaga.d_productos(id_prod),
      id_prod_fut INTEGER REFERENCES malaga.d_productos(id_prod),
      cantidad_minima NUMERIC(12,3) NOT NULL DEFAULT 0,
      ts_ulticambio TIMESTAMPTZ,
      ts_cambio_programado TIMESTAMPTZ,
      UNIQUE (sucursal, nro)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.d_exhibidora;`);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "feat(db): create d_exhibidora table"
```

---

### Task 9: Migración — tabla `f_ordenes_produccion`

**Files:**
- Create: `migrations/<timestamp>_create-f-ordenes-produccion.js`

- [ ] **Step 1: Escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_ordenes_produccion (
      id_op SERIAL PRIMARY KEY,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      id_receta INTEGER NOT NULL REFERENCES malaga.recetas(id_receta),
      cant_plan NUMERIC(12,3) NOT NULL CHECK (cant_plan > 0),
      cant_real NUMERIC(12,3),
      fecha_plan DATE NOT NULL,
      fecha_real DATE,
      ts_ini TIMESTAMPTZ,
      ts_fin TIMESTAMPTZ,
      user_ini INTEGER REFERENCES malaga.usuarios(id_user),
      user_fin INTEGER REFERENCES malaga.usuarios(id_user),
      estado TEXT NOT NULL DEFAULT 'planificada'
        CHECK (estado IN ('planificada', 'en_proceso', 'finalizada', 'cancelada')),
      obs TEXT
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_ordenes_produccion;`);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "feat(db): create f_ordenes_produccion table"
```

---

### Task 10: Migración — tabla `f_partidas_stock`

**Files:**
- Create: `migrations/<timestamp>_create-f-partidas-stock.js`

- [ ] **Step 1: Escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_partidas_stock (
      id_partistock SERIAL PRIMARY KEY,
      id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
      fecha_fab DATE NOT NULL,
      lote TEXT NOT NULL,
      ts_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
      id_op_origen INTEGER UNIQUE REFERENCES malaga.f_ordenes_produccion(id_op),
      ts_exhibicion TIMESTAMPTZ,
      id_exhibidora INTEGER REFERENCES malaga.d_exhibidora(id_exhibidora),
      user_exhibicion INTEGER REFERENCES malaga.usuarios(id_user),
      ts_baja_manual TIMESTAMPTZ,
      motivo_baja_manual TEXT CHECK (motivo_baja_manual IN ('scrap', 'vencido', 'ajuste')),
      user_baja_manual INTEGER REFERENCES malaga.usuarios(id_user),
      sucursal TEXT NOT NULL DEFAULT 'malaga-centro'
    );

    CREATE INDEX idx_partidas_stock_id_prod ON malaga.f_partidas_stock(id_prod);
    CREATE INDEX idx_partidas_stock_id_exhibidora ON malaga.f_partidas_stock(id_exhibidora);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_partidas_stock;`);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "feat(db): create f_partidas_stock table"
```

---

### Task 11: Migración — tabla `f_trazabilidad_op`

**Files:**
- Create: `migrations/<timestamp>_create-f-trazabilidad-op.js`

- [ ] **Step 1: Escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.f_trazabilidad_op (
      id_traz SERIAL PRIMARY KEY,
      id_op INTEGER NOT NULL REFERENCES malaga.f_ordenes_produccion(id_op),
      id_receta INTEGER NOT NULL REFERENCES malaga.recetas(id_receta),
      id_detalle_receta INTEGER NOT NULL REFERENCES malaga.recetas_detalles(id_det_receta),
      id_subprod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
      cant_subprod NUMERIC(12,3) NOT NULL CHECK (cant_subprod > 0),
      lote_subprod TEXT,
      id_parti_subprod INTEGER NOT NULL REFERENCES malaga.f_partidas_stock(id_partistock),
      id_prod_op INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod)
    );

    CREATE INDEX idx_trazabilidad_id_op ON malaga.f_trazabilidad_op(id_op);
    CREATE INDEX idx_trazabilidad_id_parti_subprod ON malaga.f_trazabilidad_op(id_parti_subprod);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.f_trazabilidad_op;`);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "feat(db): create f_trazabilidad_op table"
```

---

### Task 12: Migración — vista `v_stock_pt_vivo`

Implementa la regla del spec: una partida de PT está vigente si fue exhibida y es la más reciente exhibida en su `id_exhibidora`.

**Files:**
- Create: `migrations/<timestamp>_create-view-stock-pt-vivo.js`
- Test: `src/lib/queries/stockPtVivo.test.ts`

- [ ] **Step 1: Escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE VIEW malaga.v_stock_pt_vivo AS
    SELECT ps.*
    FROM malaga.f_partidas_stock ps
    JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
    WHERE p.tipo_producto = 'PT'
      AND ps.ts_exhibicion IS NOT NULL
      AND ps.id_partistock = (
        SELECT ps2.id_partistock
        FROM malaga.f_partidas_stock ps2
        WHERE ps2.id_exhibidora = ps.id_exhibidora
          AND ps2.ts_exhibicion IS NOT NULL
        ORDER BY ps2.ts_exhibicion DESC, ps2.id_partistock DESC
        LIMIT 1
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP VIEW malaga.v_stock_pt_vivo;`);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Escribir el test de integración de la vista**

```typescript
// src/lib/queries/stockPtVivo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { query, withTransaction } from '../db';

describe('v_stock_pt_vivo', () => {
  beforeEach(async () => {
    await query('TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE');
  });

  it('solo muestra la partida más reciente exhibida por slot', async () => {
    await withTransaction(async (client) => {
      const prod = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto, peso_estandar)
         VALUES ('Gianduia', 'kg', 'PT', 4) RETURNING id_prod`
      );
      const idProd = prod.rows[0].id_prod;

      const exhib = await client.query(
        `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES (1, $1) RETURNING id_exhibidora`,
        [idProd]
      );
      const idExhibidora = exhib.rows[0].id_exhibidora;

      await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion, id_exhibidora)
         VALUES ($1, 5, '2026-08-01', 'L1', '2026-08-01 08:00:00+00', $2)`,
        [idProd, idExhibidora]
      );
      await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion, id_exhibidora)
         VALUES ($1, 5, '2026-08-02', 'L2', '2026-08-02 08:00:00+00', $2)`,
        [idProd, idExhibidora]
      );
    });

    const result = await query<{ lote: string }>('SELECT lote FROM malaga.v_stock_pt_vivo');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].lote).toBe('L2');
  });
});
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run src/lib/queries/stockPtVivo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add migrations/ src/lib/queries/stockPtVivo.test.ts
git commit -m "feat(db): add v_stock_pt_vivo view with slot-succession logic"
```

---

### Task 13: Migración — vista `v_stock_semi_vivo`

Implementa la regla del spec: restante = cantidad inicial − consumo acumulado; excluye partidas cerradas manualmente o agotadas.

**Files:**
- Create: `migrations/<timestamp>_create-view-stock-semi-vivo.js`
- Test: `src/lib/queries/stockSemiVivo.test.ts`

- [ ] **Step 1: Escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE VIEW malaga.v_stock_semi_vivo AS
    SELECT
      ps.id_partistock,
      ps.id_prod,
      ps.lote,
      ps.cantidad AS cantidad_inicial,
      ps.cantidad - COALESCE(consumo.total_consumido, 0) AS restante,
      ps.ts_ingreso,
      ps.sucursal
    FROM malaga.f_partidas_stock ps
    JOIN malaga.d_productos p ON p.id_prod = ps.id_prod
    LEFT JOIN (
      SELECT id_parti_subprod, SUM(cant_subprod) AS total_consumido
      FROM malaga.f_trazabilidad_op
      GROUP BY id_parti_subprod
    ) consumo ON consumo.id_parti_subprod = ps.id_partistock
    WHERE p.tipo_producto = 'SEMI'
      AND ps.ts_baja_manual IS NULL
      AND (ps.cantidad - COALESCE(consumo.total_consumido, 0)) > 0;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP VIEW malaga.v_stock_semi_vivo;`);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Escribir el test de integración**

```typescript
// src/lib/queries/stockSemiVivo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { query, withTransaction } from '../db';

describe('v_stock_semi_vivo', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion, malaga.recetas_detalles, malaga.recetas, malaga.d_productos RESTART IDENTITY CASCADE'
    );
  });

  it('descuenta el consumo acumulado y excluye partidas agotadas', async () => {
    let idPartida: number;

    await withTransaction(async (client) => {
      const semi = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto) VALUES ('Pasta de gianduia', 'kg', 'SEMI') RETURNING id_prod`
      );
      const idSemi = semi.rows[0].id_prod;

      const pt = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto, peso_estandar)
         VALUES ('Helado gianduia', 'kg', 'PT', 4) RETURNING id_prod`
      );
      const idPt = pt.rows[0].id_prod;

      const receta = await client.query(
        `INSERT INTO malaga.recetas (id_prod, version) VALUES ($1, 1) RETURNING id_receta`,
        [idPt]
      );
      const idReceta = receta.rows[0].id_receta;

      const detalle = await client.query(
        `INSERT INTO malaga.recetas_detalles (id_receta, id_prod_padre, id_subprod, cant_subprod)
         VALUES ($1, $2, $3, 0.5) RETURNING id_det_receta`,
        [idReceta, idPt, idSemi]
      );
      const idDetalle = detalle.rows[0].id_det_receta;

      const partida = await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote)
         VALUES ($1, 5, '2026-08-01', 'SEMI-L1') RETURNING id_partistock`,
        [idSemi]
      );
      idPartida = partida.rows[0].id_partistock;

      const op = await client.query(
        `INSERT INTO malaga.f_ordenes_produccion (id_prod, id_receta, cant_plan, fecha_plan, estado)
         VALUES ($1, $2, 10, '2026-08-02', 'finalizada') RETURNING id_op`,
        [idPt, idReceta]
      );
      const idOp = op.rows[0].id_op;

      await client.query(
        `INSERT INTO malaga.f_trazabilidad_op
           (id_op, id_receta, id_detalle_receta, id_subprod, cant_subprod, id_parti_subprod, id_prod_op)
         VALUES ($1, $2, $3, $4, 4.5, $5, $6)`,
        [idOp, idReceta, idDetalle, idSemi, idPartida, idPt]
      );
    });

    const result = await query<{ restante: string }>(
      'SELECT restante FROM malaga.v_stock_semi_vivo WHERE id_partistock = $1',
      [idPartida!]
    );
    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].restante)).toBeCloseTo(0.5, 3);
  });
});
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run src/lib/queries/stockSemiVivo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add migrations/ src/lib/queries/stockSemiVivo.test.ts
git commit -m "feat(db): add v_stock_semi_vivo view with cumulative consumption logic"
```

---

### Task 14: Migración — vista `v_planificacion_diaria`

Implementa la regla del spec: el faltante en kg se redondea siempre hacia arriba en unidades de `peso_estandar` del producto, para sugerir una cantidad de OP a crear (no un kilaje suelto).

**Files:**
- Create: `migrations/<timestamp>_create-view-planificacion-diaria.js`
- Test: `src/lib/queries/planificacionDiaria.test.ts`

- [ ] **Step 1: Escribir la migración**

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE VIEW malaga.v_planificacion_diaria AS
    SELECT
      base.id_exhibidora,
      base.nro,
      base.sucursal,
      base.id_prod,
      base.producto_detalle,
      base.peso_estandar,
      base.cantidad_minima,
      base.stock_actual,
      base.faltante,
      CASE WHEN base.faltante > 0
        THEN CEIL(base.faltante / base.peso_estandar)
        ELSE 0
      END AS bachas_sugeridas,
      CASE WHEN base.faltante > 0
        THEN CEIL(base.faltante / base.peso_estandar) * base.peso_estandar
        ELSE 0
      END AS cantidad_sugerida
    FROM (
      SELECT
        e.id_exhibidora,
        e.nro,
        e.sucursal,
        e.id_prod,
        p.detalle AS producto_detalle,
        p.peso_estandar,
        e.cantidad_minima,
        COALESCE(SUM(v.cantidad), 0) AS stock_actual,
        e.cantidad_minima - COALESCE(SUM(v.cantidad), 0) AS faltante
      FROM malaga.d_exhibidora e
      JOIN malaga.d_productos p ON p.id_prod = e.id_prod
      LEFT JOIN malaga.v_stock_pt_vivo v
        ON v.id_prod = e.id_prod AND v.id_exhibidora = e.id_exhibidora
      GROUP BY e.id_exhibidora, e.nro, e.sucursal, e.id_prod, p.detalle, p.peso_estandar, e.cantidad_minima
    ) base;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP VIEW malaga.v_planificacion_diaria;`);
};
```

- [ ] **Step 2: Correr `npm run migrate:up` y verificar sin error.**

- [ ] **Step 3: Escribir el test de integración de la vista**

```typescript
// src/lib/queries/planificacionDiaria.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { query, withTransaction } from '../db';

describe('v_planificacion_diaria', () => {
  beforeEach(async () => {
    await query('TRUNCATE malaga.f_partidas_stock, malaga.d_exhibidora, malaga.d_productos RESTART IDENTITY CASCADE');
  });

  it('redondea el faltante hacia arriba en bachas de peso_estandar (10kg faltantes, bacha de 4kg -> 3 OP, 12kg)', async () => {
    let idExhibidora: number;

    await withTransaction(async (client) => {
      const prod = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto, peso_estandar)
         VALUES ('Pistacho', 'kg', 'PT', 4) RETURNING id_prod`
      );
      const idProd = prod.rows[0].id_prod;

      const exhib = await client.query(
        `INSERT INTO malaga.d_exhibidora (nro, id_prod, cantidad_minima)
         VALUES (7, $1, 10) RETURNING id_exhibidora`,
        [idProd]
      );
      idExhibidora = exhib.rows[0].id_exhibidora;
      // Sin partidas cargadas: stock_actual = 0, faltante = 10kg completos.
    });

    const result = await query<{ bachas_sugeridas: string; cantidad_sugerida: string; faltante: string }>(
      'SELECT bachas_sugeridas, cantidad_sugerida, faltante FROM malaga.v_planificacion_diaria WHERE id_exhibidora = $1',
      [idExhibidora!]
    );
    expect(result.rows).toHaveLength(1);
    expect(Number(result.rows[0].faltante)).toBeCloseTo(10, 3);
    expect(Number(result.rows[0].bachas_sugeridas)).toBe(3);
    expect(Number(result.rows[0].cantidad_sugerida)).toBeCloseTo(12, 3);
  });

  it('no sugiere bachas cuando el stock ya cubre el mínimo', async () => {
    let idExhibidora: number;

    await withTransaction(async (client) => {
      const prod = await client.query(
        `INSERT INTO malaga.d_productos (detalle, unid_med, tipo_producto, peso_estandar)
         VALUES ('Vainilla', 'kg', 'PT', 4) RETURNING id_prod`
      );
      const idProd = prod.rows[0].id_prod;

      const exhib = await client.query(
        `INSERT INTO malaga.d_exhibidora (nro, id_prod, cantidad_minima)
         VALUES (8, $1, 3) RETURNING id_exhibidora`,
        [idProd]
      );
      idExhibidora = exhib.rows[0].id_exhibidora;

      await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_exhibicion, id_exhibidora)
         VALUES ($1, 5, '2026-08-01', 'L1', '2026-08-01 08:00:00+00', $2)`,
        [idProd, idExhibidora]
      );
    });

    const result = await query<{ bachas_sugeridas: string }>(
      'SELECT bachas_sugeridas FROM malaga.v_planificacion_diaria WHERE id_exhibidora = $1',
      [idExhibidora!]
    );
    expect(Number(result.rows[0].bachas_sugeridas)).toBe(0);
  });
});
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run src/lib/queries/planificacionDiaria.test.ts`
Expected: PASS (ambos `it`)

- [ ] **Step 5: Commit**

```bash
git add migrations/ src/lib/queries/planificacionDiaria.test.ts
git commit -m "feat(db): add v_planificacion_diaria view with peso_estandar rounding"
```

---

### Task 15: Verificación end-to-end del esquema completo

**Files:**
- Test: `src/lib/schema.smoke.test.ts`

- [ ] **Step 1: Escribir un test que confirme que las 8 tablas y las 3 vistas existen**

```typescript
// src/lib/schema.smoke.test.ts
import { describe, it, expect } from 'vitest';
import { query } from './db';

const EXPECTED_TABLES = [
  'usuarios', 'd_productos', 'recetas', 'recetas_detalles',
  'd_exhibidora', 'f_ordenes_produccion', 'f_partidas_stock', 'f_trazabilidad_op',
];

const EXPECTED_VIEWS = ['v_stock_pt_vivo', 'v_stock_semi_vivo', 'v_planificacion_diaria'];

describe('malaga schema smoke test', () => {
  it('contiene todas las tablas esperadas', async () => {
    const result = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'malaga' AND table_type = 'BASE TABLE'`
    );
    const names = result.rows.map((r) => r.table_name).sort();
    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it('contiene todas las vistas esperadas', async () => {
    const result = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'malaga'`
    );
    const names = result.rows.map((r) => r.table_name).sort();
    for (const view of EXPECTED_VIEWS) {
      expect(names).toContain(view);
    }
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npx vitest run src/lib/schema.smoke.test.ts`
Expected: PASS (ambos `it`)

- [ ] **Step 3: Commit**

```bash
git add src/lib/schema.smoke.test.ts
git commit -m "test: add schema smoke test covering all tables and views"
```

---

## Self-Review

**1. Cobertura del spec (sección 5 del design doc):**
- `usuarios` → Task 5 ✓
- `d_productos` → Task 6 ✓
- `recetas` / `recetas_detalles` → Task 7 ✓
- `d_exhibidora` → Task 8 ✓
- `f_ordenes_produccion` → Task 9 ✓
- `f_partidas_stock` → Task 10 ✓
- `f_trazabilidad_op` → Task 11 ✓
- `v_stock_pt_vivo`, `v_stock_semi_vivo`, `v_planificacion_diaria` (sección 7) → Tasks 12-14 ✓
- Aislamiento de esquema/rol respecto a G360 (sección 8) → Prerrequisito manual + `.env.example` ✓
- Regla "consumo nunca bloquea por falta de stock" (sección 7) → No requiere código en esta fase: no hay ningún `CHECK` ni trigger que impida `cant_subprod` mayor al restante calculado. Se deja constancia acá para que las fases siguientes (API de carga de consumos) no agreguen esa validación por error.
- `peso_estandar` obligatorio para PT (sección 5/7) → Task 6, `CONSTRAINT peso_estandar_obligatorio_pt` ✓
- "Una OP = una partida" (sección 7) → Task 10, `id_op_origen UNIQUE` en `f_partidas_stock` ✓
- Redondeo de faltante a bachas de `peso_estandar` (sección 7) → Task 14, `v_planificacion_diaria` con `bachas_sugeridas`/`cantidad_sugerida`, cubierto por test con el ejemplo exacto del spec (10kg faltantes / bacha 4kg → 3 OP, 12kg) ✓

**2. Placeholders:** ninguno; todas las migraciones y tests tienen SQL/código completo y ejecutable.

**3. Consistencia de tipos:** `id_prod`, `id_receta`, `id_op`, `id_exhibidora`, `id_partistock`, `id_user` se usan de forma consistente como `INTEGER` referenciando las claves `SERIAL` correspondientes en todas las tablas donde aparecen como FK.

**Fuera de esta fase (quedan para planes siguientes, uno por módulo):** autenticación y sesiones, API/UI de Recetas y Productos, API/UI de Órdenes de Producción y carga de consumos, API/UI de Stock y trazabilidad, API/UI de Exhibidora y Planificación diaria, y despliegue a Render.

# Malaga Soft — Fase 2: Autenticación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login con email/password para los 2-3 usuarios de Malaga Soft, sesiones persistidas en base (auditable, revocables), protección de rutas, y un script para crear el primer usuario admin.

**Architecture:** Sesiones respaldadas en una tabla nueva (`malaga.sesiones`), no JWT stateless — permite revocar sesiones y es consistente con el resto del sistema (todo queda como registro auditable en la base, no en tokens opacos). El navegador solo guarda un token aleatorio de alta entropía en una cookie httpOnly; la base solo guarda el hash de ese token, nunca el token en texto plano (mismo principio que las passwords). El middleware de Next.js hace un chequeo barato (¿existe la cookie?) para redirigir a `/login`; la validación real contra la base (¿la sesión sigue vigente?, ¿qué rol tiene?) ocurre en un helper de servidor que cada página protegida llama.

**Tech Stack:** `bcryptjs` (hash de passwords, JS puro — sin dependencias nativas de compilación), Node `crypto` (hash de tokens de sesión), Next.js Server Actions + `next/headers` cookies, `tsx` (para correr el script de seed en TypeScript sin compilar).

---

### Task 1: Migración — tabla `sesiones`

**Files:**
- Create: `migrations/<timestamp>_create-sesiones.js`

- [ ] **Step 1: Generar y escribir la migración**

Run: `npm run migrate:create -- create-sesiones`

```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE malaga.sesiones (
      id_sesion SERIAL PRIMARY KEY,
      id_user INTEGER NOT NULL REFERENCES malaga.usuarios(id_user),
      token_hash TEXT NOT NULL UNIQUE,
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      expira TIMESTAMPTZ NOT NULL,
      user_agent TEXT
    );

    CREATE INDEX idx_sesiones_id_user ON malaga.sesiones(id_user);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE malaga.sesiones;`);
};
```

- [ ] **Step 2: Correr la migración**

Run: `npm run migrate:up`
Expected: `sesiones` creada dentro del esquema `malaga`, sin error.

- [ ] **Step 3: Commit**

```bash
git add migrations/
git commit -m "feat(db): create sesiones table for auth"
```

---

### Task 2: Hash de passwords

**Files:**
- Create: `src/lib/auth/password.ts`
- Test: `src/lib/auth/password.test.ts`

- [ ] **Step 1: Instalar dependencia**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Escribir el test**

```typescript
// src/lib/auth/password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correcto-horse-battery");
    expect(await verifyPassword("correcto-horse-battery", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correcto-horse-battery");
    expect(await verifyPassword("otra-cosa", hash)).toBe(false);
  });

  it("nunca guarda el password en texto plano dentro del hash", async () => {
    const hash = await hashPassword("mi-password-secreto");
    expect(hash).not.toContain("mi-password-secreto");
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- run src/lib/auth/password.test.ts`
Expected: FAIL con `Cannot find module './password'`

- [ ] **Step 4: Implementar**

```typescript
// src/lib/auth/password.ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- run src/lib/auth/password.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/password.ts src/lib/auth/password.test.ts package.json package-lock.json
git commit -m "feat: add password hashing with bcryptjs"
```

---

### Task 3: Módulo de sesiones (crear / validar / destruir)

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// src/lib/auth/session.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { hashPassword } from "./password";
import { createSession, getSessionUser, destroySession } from "./session";

async function createTestUser() {
  const hash = await hashPassword("test-password");
  const result = await query<{ id_user: number }>(
    `INSERT INTO malaga.usuarios (email, password_hash, rol)
     VALUES ($1, $2, 'gestion') RETURNING id_user`,
    [`test-${Date.now()}@example.com`, hash]
  );
  return result.rows[0].id_user;
}

describe("session module", () => {
  beforeEach(async () => {
    await query("TRUNCATE malaga.sesiones, malaga.usuarios RESTART IDENTITY CASCADE");
  });

  it("crea una sesión y permite recuperar el usuario a partir del token", async () => {
    const idUser = await createTestUser();
    const token = await createSession(idUser);

    const sessionUser = await getSessionUser(token);
    expect(sessionUser).not.toBeNull();
    expect(sessionUser?.idUser).toBe(idUser);
    expect(sessionUser?.rol).toBe("gestion");
  });

  it("no guarda el token en texto plano en la base", async () => {
    const idUser = await createTestUser();
    const token = await createSession(idUser);

    const result = await query<{ token_hash: string }>("SELECT token_hash FROM malaga.sesiones");
    expect(result.rows[0].token_hash).not.toBe(token);
  });

  it("devuelve null para un token inválido", async () => {
    const sessionUser = await getSessionUser("token-que-no-existe");
    expect(sessionUser).toBeNull();
  });

  it("devuelve null después de destruir la sesión", async () => {
    const idUser = await createTestUser();
    const token = await createSession(idUser);

    await destroySession(token);

    const sessionUser = await getSessionUser(token);
    expect(sessionUser).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- run src/lib/auth/session.test.ts`
Expected: FAIL con `Cannot find module './session'`

- [ ] **Step 3: Implementar**

```typescript
// src/lib/auth/session.ts
import { randomBytes, createHash } from "crypto";
import { query } from "../db";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(idUser: number, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + SESSION_DURATION_MS);

  await query(
    `INSERT INTO malaga.sesiones (id_user, token_hash, expira, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [idUser, hashToken(token), expira, userAgent ?? null]
  );

  return token;
}

export interface SessionUser {
  idUser: number;
  email: string;
  rol: "produccion" | "gestion" | "admin";
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const result = await query<{ id_user: number; email: string; rol: SessionUser["rol"] }>(
    `SELECT u.id_user, u.email, u.rol
     FROM malaga.sesiones s
     JOIN malaga.usuarios u ON u.id_user = s.id_user
     WHERE s.token_hash = $1 AND s.expira > now() AND u.activo = true`,
    [hashToken(token)]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return { idUser: row.id_user, email: row.email, rol: row.rol };
}

export async function destroySession(token: string): Promise<void> {
  await query(`DELETE FROM malaga.sesiones WHERE token_hash = $1`, [hashToken(token)]);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- run src/lib/auth/session.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat: add DB-backed session module (create/validate/destroy)"
```

---

### Task 4: Constante de cookie y helper de servidor `getCurrentUser`

**Files:**
- Create: `src/lib/auth/constants.ts`
- Create: `src/lib/auth/currentUser.ts`

`SESSION_COOKIE_NAME` vive en su propio archivo, sin más imports, a propósito: el middleware (Task 5) corre en el Edge Runtime, que no soporta el driver de Postgres (`pg` usa APIs de Node como `net`/`tls`). Si el middleware importara `currentUser.ts` (que importa `session.ts`, que importa `db.ts`), el build del Edge Runtime se rompe. `constants.ts` es el único módulo que el middleware puede importar de esta carpeta sin arrastrar la base.

`getCurrentUser` es el punto único que las páginas protegidas llaman para saber quién es el usuario logueado. No tiene test de integración propio porque es una envoltura fina sobre `getSessionUser` (ya testeado) leyendo la cookie vía `next/headers` — se cubre con las pruebas manuales de las Tasks 6-7.

- [ ] **Step 1: Implementar la constante**

```typescript
// src/lib/auth/constants.ts
export const SESSION_COOKIE_NAME = "malaga_session";
```

- [ ] **Step 2: Implementar el helper**

```typescript
// src/lib/auth/currentUser.ts
import { cookies } from "next/headers";
import { getSessionUser, type SessionUser } from "./session";
import { SESSION_COOKIE_NAME } from "./constants";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSessionUser(token);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/constants.ts src/lib/auth/currentUser.ts
git commit -m "feat: add getCurrentUser server helper"
```

---

### Task 5: Middleware de protección de rutas

**Files:**
- Create: `src/middleware.ts`

El middleware solo chequea que la cookie de sesión exista (chequeo barato, corre en cada request). La validez real (¿existe en la base?, ¿venció?) se resuelve en `getCurrentUser`, llamado desde cada página protegida.

- [ ] **Step 1: Implementar**

```typescript
// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/auth/constants";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add auth middleware gating all routes except /login"
```

---

### Task 6: Página y server action de login

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/actions.ts`

- [ ] **Step 1: Implementar la server action**

```typescript
// src/app/login/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export async function login(_prevState: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completá email y contraseña." };
  }

  const result = await query<{ id_user: number; password_hash: string; activo: boolean }>(
    `SELECT id_user, password_hash, activo FROM malaga.usuarios WHERE email = $1`,
    [email]
  );

  const usuario = result.rows[0];
  if (!usuario || !usuario.activo) {
    return { error: "Email o contraseña incorrectos." };
  }

  const valid = await verifyPassword(password, usuario.password_hash);
  if (!valid) {
    return { error: "Email o contraseña incorrectos." };
  }

  const token = await createSession(usuario.id_user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  redirect("/");
}
```

- [ ] **Step 2: Implementar la página**

```tsx
// src/app/login/page.tsx
"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div className="flex flex-1 items-center justify-center bg-bg px-6">
      <form
        action={formAction}
        className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-border bg-surface p-8"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-copper">
            Heladería · Producción
          </p>
          <h1 className="font-display text-4xl italic text-ink">Malaga Soft</h1>
        </div>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-ink outline-none focus:border-copper"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Contraseña
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-ink outline-none focus:border-copper"
          />
        </label>

        {state?.error && <p className="text-sm text-bad">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/login/
git commit -m "feat: add login page and server action"
```

---

### Task 7: Logout y protección de la home

**Files:**
- Create: `src/app/logout/actions.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Server action de logout**

```typescript
// src/app/logout/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroySession(token);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
  redirect("/login");
}
```

- [ ] **Step 2: Usar `getCurrentUser` en la home y mostrar quién está logueado**

Reemplazar el contenido de `src/app/page.tsx` (el placeholder de la Fase 1) para que sea un server component que llama a `getCurrentUser()` y muestra el email/rol, con un botón de logout:

```tsx
// src/app/page.tsx
import { getCurrentUser } from "@/lib/auth/currentUser";
import { logout } from "./logout/actions";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-bg px-6 py-24 text-ink">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-copper">
          Heladería · Producción
        </p>
        <h1 className="font-display text-5xl italic leading-none text-ink">Malaga Soft</h1>
        <p className="max-w-sm text-sm text-ink-soft">
          {user ? `Conectado como ${user.email} (${user.rol})` : "Sesión no encontrada"}
        </p>
      </div>

      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:border-copper hover:text-copper-strong"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/logout/ src/app/page.tsx
git commit -m "feat: add logout action and show current user on home"
```

---

### Task 8: Script para crear el primer usuario

Sin esto no hay forma de loguearse la primera vez (no hay auto-registro). Se corre una sola vez por usuario nuevo, a mano, por un admin.

**Files:**
- Create: `scripts/create-user.ts`

- [ ] **Step 1: Instalar `tsx`**

```bash
npm install -D tsx
```

- [ ] **Step 2: Implementar el script**

Recibe los datos por argumentos de línea de comandos, no por `readline` interactivo: en pruebas reales, el prompt interactivo de `readline` no leía bien un stdin no-TTY/pipeado en este entorno (Windows/Git Bash) y el script quedaba colgado sin insertar nada. Argumentos explícitos son además más fáciles de scriptear/automatizar.

```typescript
// scripts/create-user.ts
import { hashPassword } from "../src/lib/auth/password";
import { query } from "../src/lib/db";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main() {
  const email = getArg("email")?.trim().toLowerCase();
  const rol = getArg("rol")?.trim();
  const password = getArg("password");

  if (!email || !rol || !password) {
    console.error(
      "Uso: npm run create-user -- --email=alguien@ejemplo.com --rol=admin --password=algo-seguro"
    );
    process.exit(1);
  }

  if (!["produccion", "gestion", "admin"].includes(rol)) {
    console.error(`Rol inválido: ${rol} (debe ser produccion, gestion o admin)`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  await query(
    `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ($1, $2, $3)`,
    [email, passwordHash, rol]
  );

  console.log(`Usuario ${email} (${rol}) creado.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Agregar script a `package.json`**

```json
"create-user": "cross-env NODE_EXTRA_CA_CERTS=./certs/server-ca.pem tsx --env-file=.env scripts/create-user.ts"
```

- [ ] **Step 4: Probarlo manualmente contra la base real**

Run: `npm run create-user -- --email=alguien@ejemplo.com --rol=admin --password=algo-seguro`
Confirmar que el usuario aparece en `malaga.usuarios` y que el password no quedó en texto plano.

- [ ] **Step 5: Commit**

```bash
git add scripts/create-user.ts package.json package-lock.json
git commit -m "feat: add create-user script for onboarding the first admin"
```

---

## Self-Review

**1. Cobertura del spec:**
- Login con email/password → Tasks 6 ✓
- Roles `produccion`/`gestion`/`admin` → ya existen en `usuarios.rol` (Fase 1); validados en el script de creación (Task 8) y disponibles en `SessionUser` (Task 3) ✓
- Passwords siempre hasheadas (sección 8 del spec) → Task 2, cubierto por test que confirma que el hash no contiene el texto plano ✓
- Sesiones auditable/revocable, no exponer tokens ni sesiones por defecto (sección 8) → Task 3, `sesiones.token_hash` nunca guarda el token crudo, cubierto por test ✓
- Sin acceso a datos sin login → Task 5 (middleware protege todo excepto `/login`) ✓

**2. Placeholders:** ninguno.

**3. Consistencia de tipos:** `SessionUser.rol` usa el mismo union type `"produccion" | "gestion" | "admin"` en `session.ts` y se reutiliza sin redefinir en `currentUser.ts` (reexportado).

**Fuera de esta fase:** gestión de usuarios vía UI (alta/baja/cambio de rol desde la propia app — v1 se resuelve con el script de Task 8), recuperación de password (no aplica con 2-3 usuarios conocidos; si alguien la olvida, un admin la resetea corriendo el script de nuevo o una variante `reset-password`), rate limiting de intentos de login.

## Incidente durante la ejecución: los tests borraron el usuario admin real

Al ejecutar esta fase por primera vez contra la base real, correr `npm test` truncó `malaga.usuarios` (vía el `beforeEach` de `session.test.ts`) y borró el usuario admin recién creado — porque **no existe todavía un esquema de test separado**; los tests de integración de este proyecto siempre pegaron contra el mismo esquema `malaga` que va a tener datos reales. Se restauró el usuario a mano y se agregó un seguro:

- `vitest.setup.ts` ahora **bloquea** cualquier corrida a menos que se pase `RUN_DESTRUCTIVE_DB_TESTS=true`.
- `npm test` (el comando "normal") falla rápido con un mensaje explicando por qué.
- `npm run test:db` es el opt-in explícito para correr los tests de integración a propósito, sabiendo que van a truncar tablas reales.

**Deuda técnica pendiente, antes de sumar más usuarios reales al sistema:** separar un esquema `malaga_test` real (o una base de test aparte) para que los tests de integración dejen de tocar datos productivos. Esto requiere además parametrizar el nombre del esquema en las migraciones (hoy `malaga.` está hardcodeado en cada `CREATE TABLE`/`CREATE VIEW`, así que no alcanza con correr `node-pg-migrate --schema malaga_test`: el SQL interno seguiría apuntando a `malaga`). No se resolvió en esta fase por alcance/tiempo — queda anotado para no perderlo de vista.

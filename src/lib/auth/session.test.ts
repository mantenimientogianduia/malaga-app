import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { query } from "../db";
import { hashPassword } from "./password";
import { createSession, getSessionUser, destroySession } from "./session";

// No se trunca malaga.usuarios acá (es una tabla real compartida con cuentas
// de verdad) — cada usuario de test usa un email único (Date.now()), y se
// limpia por patrón al final del archivo en vez de arrasar toda la tabla.
async function createTestUser() {
  const hash = await hashPassword("test-password");
  const result = await query<{ id_user: number }>(
    `INSERT INTO malaga.usuarios (email, password_hash, rol)
     VALUES ($1, $2, 'gestion') RETURNING id_user`,
    [`test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, hash]
  );
  return result.rows[0].id_user;
}

describe("session module", () => {
  beforeEach(async () => {
    await query("TRUNCATE malaga.sesiones RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await query("DELETE FROM malaga.usuarios WHERE email LIKE 'test-%@example.com'");
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

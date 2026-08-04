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

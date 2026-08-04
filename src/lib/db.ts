import { Pool, QueryResultRow } from "pg";

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  // Verificación de certificado SIEMPRE activa (rejectUnauthorized: true — nunca
  // desactivar esto). La CA de Cloud SQL se confía vía NODE_EXTRA_CA_CERTS, no acá.
  // checkServerIdentity se omite a propósito: el certificado de Cloud SQL está
  // emitido para un nombre interno de Google (*.sql.goog), no para la IP pública
  // con la que nos conectamos sin el Cloud SQL Auth Proxy. La cadena de confianza
  // (CA) se sigue validando igual; sólo se salta la comparación exacta de hostname.
  ssl:
    process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: true, checkServerIdentity: () => undefined }
      : undefined,
  options: `-c search_path=${process.env.PG_SCHEMA ?? "malaga"}`,
});

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

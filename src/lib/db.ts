import { Pool, QueryResultRow } from "pg";

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  // Verificación de certificado SIEMPRE activa (rejectUnauthorized: true — nunca
  // desactivar esto). checkServerIdentity se omite a propósito: el certificado de
  // Cloud SQL está emitido para un nombre interno de Google (*.sql.goog), no para
  // la IP pública con la que nos conectamos sin el Cloud SQL Auth Proxy. La cadena
  // de confianza (CA) se sigue validando igual; sólo se salta la comparación exacta
  // de hostname.
  //
  // La CA se confía de dos formas posibles: localmente, vía NODE_EXTRA_CA_CERTS
  // apuntando a certs/server-ca.pem (un archivo, no versionado). En un entorno sin
  // filesystem persistente como Vercel no hay archivo que apuntar, así que ahí se
  // usa PGSSLROOTCERT_CONTENT con el contenido del certificado pegado directo como
  // variable de entorno. Si no está seteada, el comportamiento es exactamente el de
  // siempre (depende de NODE_EXTRA_CA_CERTS).
  ssl:
    process.env.PGSSLMODE === "require"
      ? {
          rejectUnauthorized: true,
          checkServerIdentity: () => undefined,
          ...(process.env.PGSSLROOTCERT_CONTENT ? { ca: process.env.PGSSLROOTCERT_CONTENT } : {}),
        }
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

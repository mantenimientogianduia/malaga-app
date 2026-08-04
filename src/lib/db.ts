import { Pool, QueryResultRow } from "pg";

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  // Verificación de certificado SIEMPRE activa. Si el servidor usa un certificado
  // autofirmado, no desactivar rejectUnauthorized: en cambio, apuntar PGSSLROOTCERT
  // al archivo de la CA y cargarlo acá (fs.readFileSync(process.env.PGSSLROOTCERT)).
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : undefined,
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

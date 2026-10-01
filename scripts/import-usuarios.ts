// Restaura las cuentas reales desde el respaldo local generado por
// export-usuarios.ts. Hace upsert por email: si la cuenta ya existe no la
// toca más que para sincronizar rol/estado/hash, y si no existe la crea con
// el hash real guardado (nunca genera una contraseña nueva). Pensado para
// correr después de cualquier npm run test:db, igual que import-historico.ts
// e import-recetas.ts restauran el resto de los datos reales.
import { readFileSync } from "fs";
import path from "path";
import { query } from "../src/lib/db";

const BACKUP_PATH = path.join(__dirname, "..", "data", "imports", "usuarios-backup.json");

interface UsuarioBackup {
  email: string;
  password_hash: string;
  rol: string;
  activo: boolean;
}

async function main() {
  const raw = readFileSync(BACKUP_PATH, "utf-8");
  const usuarios: UsuarioBackup[] = JSON.parse(raw);

  let creados = 0;
  let actualizados = 0;

  for (const u of usuarios) {
    const result = await query<{ inserted: boolean }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             rol = EXCLUDED.rol,
             activo = EXCLUDED.activo
       RETURNING (xmax = 0) AS inserted`,
      [u.email, u.password_hash, u.rol, u.activo]
    );
    if (result.rows[0].inserted) creados++;
    else actualizados++;
  }

  console.log(`${creados} usuarios creados, ${actualizados} ya existían (sincronizados). Total: ${usuarios.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

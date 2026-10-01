// Guarda un respaldo local (no versionado) de las cuentas reales de
// malaga.usuarios, incluyendo el hash de contraseña tal cual está guardado
// (nunca la contraseña en texto plano). Correr después de crear o actualizar
// cuentas reales, para poder restaurarlas con import-usuarios.ts si la tabla
// se pierde (ej. por un TRUNCATE accidental o un olvido al agregar un test).
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { query } from "../src/lib/db";

const BACKUP_PATH = path.join(__dirname, "..", "data", "imports", "usuarios-backup.json");

async function main() {
  const result = await query<{
    email: string;
    password_hash: string;
    rol: string;
    activo: boolean;
  }>(`SELECT email, password_hash, rol, activo FROM malaga.usuarios ORDER BY email`);

  mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
  writeFileSync(BACKUP_PATH, JSON.stringify(result.rows, null, 2));

  console.log(`${result.rows.length} usuarios guardados en ${BACKUP_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

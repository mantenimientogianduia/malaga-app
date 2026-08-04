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

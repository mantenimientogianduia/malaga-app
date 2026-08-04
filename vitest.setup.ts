import { config } from "dotenv";

config({ path: ".env" });

// Estos tests de integración pegan contra la base real y compartida con G360
// (todavía no hay un esquema de test separado — es deuda técnica pendiente).
// Varios usan TRUNCATE sobre malaga.usuarios y otras tablas: correrlos sin
// darse cuenta borra datos reales, como pasó una vez con el primer usuario
// admin. Bloqueado por defecto: hace falta un opt-in explícito.
if (!process.env.RUN_DESTRUCTIVE_DB_TESTS) {
  throw new Error(
    "Tests bloqueados: corren TRUNCATE contra la base real compartida con G360 (no hay " +
      "esquema de test separado todavía). Para correrlos a propósito, con los ojos abiertos " +
      "sobre el riesgo: npm run test:db"
  );
}

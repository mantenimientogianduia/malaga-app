import { describe, it, expect } from "vitest";
import { query } from "./db";

const EXPECTED_TABLES = [
  "usuarios",
  "d_productos",
  "recetas",
  "recetas_detalles",
  "d_exhibidora",
  "f_ordenes_produccion",
  "f_partidas_stock",
  "f_trazabilidad_op",
];

const EXPECTED_VIEWS = ["v_stock_pt_vivo", "v_stock_semi_vivo"];

describe("malaga schema smoke test", () => {
  it("contiene todas las tablas esperadas", async () => {
    const result = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'malaga' AND table_type = 'BASE TABLE'`
    );
    const names = result.rows.map((r) => r.table_name).sort();
    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it("contiene todas las vistas esperadas", async () => {
    const result = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'malaga'`
    );
    const names = result.rows.map((r) => r.table_name).sort();
    for (const view of EXPECTED_VIEWS) {
      expect(names).toContain(view);
    }
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { listPronosticoVsReal } from "./stats";

describe("listPronosticoVsReal", () => {
  beforeEach(async () => {
    await query(
      "TRUNCATE malaga.f_pcp_pronostico, malaga.f_ordenes_produccion, malaga.d_productos RESTART IDENTITY CASCADE"
    );
  });

  it("solo trae filas con cantidad_planificada > 0, más recientes primero", async () => {
    const p = await createProducto({ detalle: "Vainilla", unidMed: "kg", tipoProducto: "PT", pesoEstandar: 4 });
    await query(
      `INSERT INTO malaga.f_pcp_pronostico
         (fecha_plan, id_prod, demanda_pronosticada, stock_actual_momento, stock_minimo_momento,
          cocciones_pendientes_momento, necesario, cantidad_planificada, ts_generado)
       VALUES ('2026-08-05', $1, 5, 0, 4, 0, 5, 0, now() - interval '1 day'),
              ('2026-08-06', $1, 6, 0, 4, 0, 6, 8, now())`,
      [p.idProd]
    );

    const filas = await listPronosticoVsReal();
    expect(filas).toHaveLength(1);
    expect(filas[0].fechaPlan).toBe("2026-08-06");
    expect(filas[0].cantidadPlanificada).toBe(8);
  });
});

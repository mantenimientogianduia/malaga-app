import { describe, it, expect, beforeEach } from "vitest";
import { query } from "../db";
import { createProducto } from "../productos/queries";
import { createReceta, listRecetasActivas } from "./queries";

describe("recetas queries", () => {
  beforeEach(async () => {
    // malaga.usuarios NO se trunca acá — es la tabla real de cuentas del
    // sistema. Las tablas que le hacen referencia sí se truncan arriba.
    await query(
      "TRUNCATE malaga.recetas_detalles, malaga.recetas, malaga.d_productos RESTART IDENTITY CASCADE"
    );
    await query("DELETE FROM malaga.usuarios WHERE email = 't@t.com'");
  });

  async function seedUser() {
    const r = await query<{ id_user: number }>(
      `INSERT INTO malaga.usuarios (email, password_hash, rol) VALUES ('t@t.com', 'x', 'admin') RETURNING id_user`
    );
    return r.rows[0].id_user;
  }

  it("crea la versión 1 de una receta con sus ingredientes", async () => {
    const userAlta = await seedUser();
    const pt = await createProducto({
      detalle: "Helado gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    const semi = await createProducto({ detalle: "Pasta gianduia", unidMed: "kg", tipoProducto: "SEMI" });

    const receta = await createReceta({
      idProd: pt.idProd,
      items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }],
      userAlta,
    });

    expect(receta.version).toBe(1);
    expect(receta.activa).toBe(true);
  });

  it("una nueva versión desactiva la anterior", async () => {
    const userAlta = await seedUser();
    const pt = await createProducto({
      detalle: "Helado gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });
    const semi = await createProducto({ detalle: "Pasta gianduia", unidMed: "kg", tipoProducto: "SEMI" });

    const v1 = await createReceta({
      idProd: pt.idProd,
      items: [{ idSubprod: semi.idProd, cantSubprod: 0.5 }],
      userAlta,
    });
    const v2 = await createReceta({
      idProd: pt.idProd,
      items: [{ idSubprod: semi.idProd, cantSubprod: 0.6 }],
      userAlta,
    });

    expect(v2.version).toBe(2);

    const activas = await listRecetasActivas();
    const idsActivos = activas.map((r) => r.idReceta);
    expect(idsActivos).toContain(v2.idReceta);
    expect(idsActivos).not.toContain(v1.idReceta);
  });

  it("rechaza una receta que se referencia a sí misma como ingrediente", async () => {
    const userAlta = await seedUser();
    const pt = await createProducto({
      detalle: "Helado gianduia",
      unidMed: "kg",
      tipoProducto: "PT",
      pesoEstandar: 4,
    });

    await expect(
      createReceta({ idProd: pt.idProd, items: [{ idSubprod: pt.idProd, cantSubprod: 1 }], userAlta })
    ).rejects.toThrow(/mismo/);
  });
});

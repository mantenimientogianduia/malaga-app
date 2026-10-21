import { withTransaction } from "../src/lib/db";
import { DEMANDA_SEMANAL_INICIAL, PCT_DIA_INICIAL } from "../src/lib/pcp/demanda";
import { PCT_SABORES_INICIALES, emparejarPorNombre } from "../src/lib/pcp/seed";

// Carga (de forma idempotente) la demanda semanal, los % por día y los % por sabor iniciales de PCP.
// Hay que volver a correrlo después de reimportar el catálogo (los % por sabor referencian productos).
(async () => {
  await withTransaction(async (client) => {
    const productos = await client.query<{ id_prod: number; detalle: string }>(
      `SELECT id_prod, detalle FROM malaga.d_productos WHERE tipo_producto = 'PT'`
    );
    const { encontrados, noEncontrados } = emparejarPorNombre(
      PCT_SABORES_INICIALES,
      productos.rows.map((p) => ({ idProd: p.id_prod, detalle: p.detalle }))
    );

    await client.query(`UPDATE malaga.pcp_config SET demanda_semanal_kg = $1 WHERE id = 1`, [
      DEMANDA_SEMANAL_INICIAL,
    ]);
    await client.query(
      `INSERT INTO malaga.pcp_pct_dia (dia_semana, pct)
       SELECT d, p FROM unnest($1::int[], $2::numeric[]) AS t(d, p)
       ON CONFLICT (dia_semana) DO UPDATE SET pct = EXCLUDED.pct`,
      [PCT_DIA_INICIAL.map((_, i) => i + 1), PCT_DIA_INICIAL]
    );
    if (encontrados.length > 0) {
      await client.query(
        `INSERT INTO malaga.pcp_pct_sabor (id_prod, pct)
         SELECT i, p FROM unnest($1::int[], $2::numeric[]) AS t(i, p)
         ON CONFLICT (id_prod) DO UPDATE SET pct = EXCLUDED.pct`,
        [encontrados.map((e) => e.idProd), encontrados.map((e) => e.pct)]
      );
    }

    console.log(`Demanda semanal: ${DEMANDA_SEMANAL_INICIAL} kg. % por día: ${PCT_DIA_INICIAL.join(", ")}.`);
    console.log(`Sabores cargados: ${encontrados.length} de ${PCT_SABORES_INICIALES.length}.`);
    if (noEncontrados.length > 0) {
      console.log(`SIN EMPAREJAR (revisar el nombre en el catálogo): ${noEncontrados.join("; ")}`);
    }
  });
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

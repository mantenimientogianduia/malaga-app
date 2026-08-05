import { query, withTransaction } from "../db";

export interface RecetaItemInput {
  idSubprod: number;
  cantSubprod: number;
}

export interface CreateRecetaInput {
  idProd: number;
  items: RecetaItemInput[];
  userAlta: number;
}

export interface Receta {
  idReceta: number;
  idProd: number;
  version: number;
  activa: boolean;
}

export async function createReceta(input: CreateRecetaInput): Promise<Receta> {
  if (input.items.length === 0) {
    throw new Error("La receta necesita al menos un ingrediente");
  }
  for (const item of input.items) {
    if (item.idSubprod === input.idProd) {
      throw new Error("Un producto no puede ser ingrediente de sí mismo");
    }
  }

  return withTransaction(async (client) => {
    const versionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM malaga.recetas WHERE id_prod = $1`,
      [input.idProd]
    );
    const nextVersion = versionResult.rows[0].next_version;

    await client.query(`UPDATE malaga.recetas SET activa = false WHERE id_prod = $1`, [input.idProd]);

    const recetaResult = await client.query<{ id_receta: number }>(
      `INSERT INTO malaga.recetas (id_prod, version, activa, user_alta)
       VALUES ($1, $2, true, $3) RETURNING id_receta`,
      [input.idProd, nextVersion, input.userAlta]
    );
    const idReceta = recetaResult.rows[0].id_receta;

    for (const item of input.items) {
      await client.query(
        `INSERT INTO malaga.recetas_detalles (id_receta, id_prod_padre, id_subprod, cant_subprod)
         VALUES ($1, $2, $3, $4)`,
        [idReceta, input.idProd, item.idSubprod, item.cantSubprod]
      );
    }

    return { idReceta, idProd: input.idProd, version: nextVersion, activa: true };
  });
}

export interface RecetaConDetalle {
  idReceta: number;
  idProd: number;
  productoDetalle: string;
  version: number;
  activa: boolean;
  items: Array<{ idSubprod: number; subprodDetalle: string; cantSubprod: string }>;
}

async function fetchItems(idReceta: number) {
  const itemsResult = await query<{
    id_subprod: number;
    subprod_detalle: string;
    cant_subprod: string;
  }>(
    `SELECT rd.id_subprod, sp.detalle AS subprod_detalle, rd.cant_subprod
     FROM malaga.recetas_detalles rd
     JOIN malaga.d_productos sp ON sp.id_prod = rd.id_subprod
     WHERE rd.id_receta = $1
     ORDER BY sp.detalle`,
    [idReceta]
  );
  return itemsResult.rows.map((i) => ({
    idSubprod: i.id_subprod,
    subprodDetalle: i.subprod_detalle,
    cantSubprod: i.cant_subprod,
  }));
}

export async function listRecetasActivas(): Promise<RecetaConDetalle[]> {
  const result = await query<{
    id_receta: number;
    id_prod: number;
    producto_detalle: string;
    version: number;
    activa: boolean;
    id_subprod: number | null;
    subprod_detalle: string | null;
    cant_subprod: string | null;
  }>(
    `SELECT r.id_receta, r.id_prod, p.detalle AS producto_detalle, r.version, r.activa,
            rd.id_subprod, sp.detalle AS subprod_detalle, rd.cant_subprod
     FROM malaga.recetas r
     JOIN malaga.d_productos p ON p.id_prod = r.id_prod
     LEFT JOIN malaga.recetas_detalles rd ON rd.id_receta = r.id_receta
     LEFT JOIN malaga.d_productos sp ON sp.id_prod = rd.id_subprod
     WHERE r.activa = true
     ORDER BY p.detalle, sp.detalle`
  );

  const recetas = new Map<number, RecetaConDetalle>();
  for (const r of result.rows) {
    let receta = recetas.get(r.id_receta);
    if (!receta) {
      receta = {
        idReceta: r.id_receta,
        idProd: r.id_prod,
        productoDetalle: r.producto_detalle,
        version: r.version,
        activa: r.activa,
        items: [],
      };
      recetas.set(r.id_receta, receta);
    }
    if (r.id_subprod !== null) {
      receta.items.push({
        idSubprod: r.id_subprod,
        subprodDetalle: r.subprod_detalle!,
        cantSubprod: r.cant_subprod!,
      });
    }
  }
  return Array.from(recetas.values());
}

export async function getRecetaActivaPorProducto(idProd: number): Promise<RecetaConDetalle | null> {
  const result = await query<{
    id_receta: number;
    id_prod: number;
    producto_detalle: string;
    version: number;
    activa: boolean;
  }>(
    `SELECT r.id_receta, r.id_prod, p.detalle AS producto_detalle, r.version, r.activa
     FROM malaga.recetas r
     JOIN malaga.d_productos p ON p.id_prod = r.id_prod
     WHERE r.id_prod = $1 AND r.activa = true`,
    [idProd]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    idReceta: r.id_receta,
    idProd: r.id_prod,
    productoDetalle: r.producto_detalle,
    version: r.version,
    activa: r.activa,
    items: await fetchItems(r.id_receta),
  };
}

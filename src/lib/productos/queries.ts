import { query } from "../db";

export type TipoProducto = "PT" | "SEMI";

export interface Producto {
  idProd: number;
  codigo: string | null;
  detalle: string;
  sector: string | null;
  familia: string | null;
  unidMed: string;
  tipoProducto: TipoProducto;
  pesoEstandar: string | null;
  activo: boolean;
  posicionExhibidora: number | null;
  stockMinimo: string;
  loteOptimo: string | null;
  loteMinimo: string | null;
}

interface ProductoRow {
  id_prod: number;
  codigo: string | null;
  detalle: string;
  sector: string | null;
  familia: string | null;
  unid_med: string;
  tipo_producto: TipoProducto;
  peso_estandar: string | null;
  activo: boolean;
  posicion_exhibidora: number | null;
  stock_minimo: string;
  lote_optimo: string | null;
  lote_minimo: string | null;
}

function mapRow(row: ProductoRow): Producto {
  return {
    idProd: row.id_prod,
    codigo: row.codigo,
    detalle: row.detalle,
    sector: row.sector,
    familia: row.familia,
    unidMed: row.unid_med,
    tipoProducto: row.tipo_producto,
    pesoEstandar: row.peso_estandar,
    activo: row.activo,
    posicionExhibidora: row.posicion_exhibidora,
    stockMinimo: row.stock_minimo,
    loteOptimo: row.lote_optimo,
    loteMinimo: row.lote_minimo,
  };
}

const SELECT_COLUMNS = `p.id_prod, p.codigo, p.detalle, p.sector, p.familia, p.unid_med, p.tipo_producto,
       p.peso_estandar, p.activo, e.nro AS posicion_exhibidora, p.stock_minimo, p.lote_optimo, p.lote_minimo`;
const FROM_CLAUSE = `FROM malaga.d_productos p
     LEFT JOIN malaga.d_exhibidora e ON e.id_prod = p.id_prod`;

export async function listProductos(): Promise<Producto[]> {
  const result = await query<ProductoRow>(
    `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ORDER BY p.tipo_producto, p.detalle`
  );
  return result.rows.map(mapRow);
}

export async function getProducto(idProd: number): Promise<Producto | null> {
  const result = await query<ProductoRow>(
    `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE p.id_prod = $1`,
    [idProd]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export interface UpdateProductoInput {
  codigo?: string;
  detalle: string;
  sector?: string;
  familia?: string;
  unidMed: string;
  pesoEstandar?: number;
  activo: boolean;
  stockMinimo: number;
  loteOptimo?: number;
  loteMinimo?: number;
}

export async function updateProducto(idProd: number, input: UpdateProductoInput): Promise<Producto> {
  const existing = await getProducto(idProd);
  if (!existing) throw new Error("Producto no encontrado");
  if (existing.tipoProducto === "PT" && !input.pesoEstandar) {
    throw new Error("peso_estandar es obligatorio para productos PT");
  }

  await query(
    `UPDATE malaga.d_productos
     SET codigo = $2, detalle = $3, sector = $4, familia = $5, unid_med = $6, peso_estandar = $7, activo = $8,
         stock_minimo = $9, lote_optimo = $10, lote_minimo = $11
     WHERE id_prod = $1`,
    [
      idProd,
      input.codigo ?? null,
      input.detalle,
      input.sector ?? null,
      input.familia ?? null,
      input.unidMed,
      input.pesoEstandar ?? null,
      input.activo,
      input.stockMinimo,
      input.loteOptimo ?? null,
      input.loteMinimo ?? null,
    ]
  );
  const updated = await getProducto(idProd);
  return updated!;
}

export interface CreateProductoInput {
  codigo?: string;
  detalle: string;
  sector?: string;
  familia?: string;
  unidMed: string;
  tipoProducto: TipoProducto;
  pesoEstandar?: number;
}

export async function createProducto(input: CreateProductoInput): Promise<Producto> {
  if (input.tipoProducto === "PT" && !input.pesoEstandar) {
    throw new Error("peso_estandar es obligatorio para productos PT");
  }

  const result = await query<{ id_prod: number }>(
    `INSERT INTO malaga.d_productos (codigo, detalle, sector, familia, unid_med, tipo_producto, peso_estandar)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id_prod`,
    [
      input.codigo ?? null,
      input.detalle,
      input.sector ?? null,
      input.familia ?? null,
      input.unidMed,
      input.tipoProducto,
      input.pesoEstandar ?? null,
    ]
  );
  const created = await getProducto(result.rows[0].id_prod);
  return created!;
}

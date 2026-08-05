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
  };
}

export async function listProductos(): Promise<Producto[]> {
  const result = await query<ProductoRow>(
    `SELECT id_prod, codigo, detalle, sector, familia, unid_med, tipo_producto, peso_estandar, activo
     FROM malaga.d_productos
     ORDER BY tipo_producto, detalle`
  );
  return result.rows.map(mapRow);
}

export async function getProducto(idProd: number): Promise<Producto | null> {
  const result = await query<ProductoRow>(
    `SELECT id_prod, codigo, detalle, sector, familia, unid_med, tipo_producto, peso_estandar, activo
     FROM malaga.d_productos
     WHERE id_prod = $1`,
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
}

export async function updateProducto(idProd: number, input: UpdateProductoInput): Promise<Producto> {
  const existing = await getProducto(idProd);
  if (!existing) throw new Error("Producto no encontrado");
  if (existing.tipoProducto === "PT" && !input.pesoEstandar) {
    throw new Error("peso_estandar es obligatorio para productos PT");
  }

  const result = await query<ProductoRow>(
    `UPDATE malaga.d_productos
     SET codigo = $2, detalle = $3, sector = $4, familia = $5, unid_med = $6, peso_estandar = $7, activo = $8
     WHERE id_prod = $1
     RETURNING id_prod, codigo, detalle, sector, familia, unid_med, tipo_producto, peso_estandar, activo`,
    [
      idProd,
      input.codigo ?? null,
      input.detalle,
      input.sector ?? null,
      input.familia ?? null,
      input.unidMed,
      input.pesoEstandar ?? null,
      input.activo,
    ]
  );
  return mapRow(result.rows[0]);
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

  const result = await query<ProductoRow>(
    `INSERT INTO malaga.d_productos (codigo, detalle, sector, familia, unid_med, tipo_producto, peso_estandar)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id_prod, codigo, detalle, sector, familia, unid_med, tipo_producto, peso_estandar, activo`,
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
  return mapRow(result.rows[0]);
}

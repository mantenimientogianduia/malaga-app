import { query } from "../db";

export type TipoProducto = "PT" | "SEMI";

export interface Producto {
  idProd: number;
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
    `SELECT id_prod, detalle, sector, familia, unid_med, tipo_producto, peso_estandar, activo
     FROM malaga.d_productos
     ORDER BY tipo_producto, detalle`
  );
  return result.rows.map(mapRow);
}

export interface CreateProductoInput {
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
    `INSERT INTO malaga.d_productos (detalle, sector, familia, unid_med, tipo_producto, peso_estandar)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id_prod, detalle, sector, familia, unid_med, tipo_producto, peso_estandar, activo`,
    [
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

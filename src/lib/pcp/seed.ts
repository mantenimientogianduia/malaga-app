export interface PctSaborInicial {
  nombre: string;
  pct: number;
}

// % de venta de cada sabor sobre el total, definidos por el dueño del negocio (suman 100).
export const PCT_SABORES_INICIALES: PctSaborInicial[] = [
  { nombre: "Kinder Bueno", pct: 6 },
  { nombre: "Pistacho", pct: 5.6 },
  { nombre: "Crema Oreo", pct: 4.2 },
  { nombre: "Choco Dubai", pct: 5 },
  { nombre: "Frangipane", pct: 3.7 },
  { nombre: "Cheesecake", pct: 3.8 },
  { nombre: "Málaga", pct: 3 },
  { nombre: "Pistacho macaron", pct: 4.4 },
  { nombre: "Fresa", pct: 4 },
  { nombre: "Limon con cascaritas", pct: 4 },
  { nombre: "Chocolate belga", pct: 5 },
  { nombre: "Banana Toffee", pct: 4 },
  { nombre: "Lemon pie", pct: 3.7 },
  { nombre: "Dulce de Leche Rogel", pct: 4.8 },
  { nombre: "Oro y Oro", pct: 3 },
  { nombre: "DDL Granizado", pct: 3.3 },
  { nombre: "Gianduia", pct: 4.5 },
  { nombre: "Snickers", pct: 4 },
  { nombre: "Vainilla", pct: 4.5 },
  { nombre: "Mango - Maracuya", pct: 6 },
  { nombre: "Ciocco Nero (con macadamia)", pct: 3.6 },
  { nombre: "Tiramisu", pct: 3 },
  { nombre: "Yogurt Crock", pct: 2.5 },
  { nombre: "Caramel Lets pop", pct: 4.4 },
];

export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function emparejarPorNombre(
  deseados: PctSaborInicial[],
  productos: { idProd: number; detalle: string }[]
): { encontrados: { idProd: number; nombre: string; pct: number }[]; noEncontrados: string[] } {
  const porNombre = new Map(productos.map((p) => [normalizarNombre(p.detalle), p.idProd]));
  const encontrados: { idProd: number; nombre: string; pct: number }[] = [];
  const noEncontrados: string[] = [];
  for (const d of deseados) {
    const idProd = porNombre.get(normalizarNombre(d.nombre));
    if (idProd === undefined) noEncontrados.push(d.nombre);
    else encontrados.push({ idProd, nombre: d.nombre, pct: d.pct });
  }
  return { encontrados, noEncontrados };
}

import { query } from "../db";
import { regresionLineal, proyectarSiguiente } from "./forecast";
import { getExhibicionesPorSemana, getDistribucionPorDia, getDistribucionPorProducto } from "./queries";

const DIA_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export interface TendenciaSemanal {
  semana: string;
  total: number;
}

export interface Tendencia {
  puntos: TendenciaSemanal[];
  proyeccionSemanaSiguiente: number;
  pendiente: number;
}

export async function getTendenciaSemanal(): Promise<Tendencia> {
  const semanas = await getExhibicionesPorSemana(8);
  const totales = semanas.map((s) => s.total);
  const { pendiente } = regresionLineal(totales);
  return {
    puntos: semanas,
    proyeccionSemanaSiguiente: proyectarSiguiente(totales),
    pendiente,
  };
}

export interface InsightsInput {
  distribucionDia: Record<number, number>;
  distribucionProducto: Record<number, number>;
  productosDetalle: Record<number, string>;
  pendiente: number;
}

export function generarInsights(input: InsightsInput): string[] {
  const insights: string[] = [];

  const diasConDatos = Object.entries(input.distribucionDia);
  if (diasConDatos.length > 0) {
    const promedio = diasConDatos.reduce((acc, [, pct]) => acc + pct, 0) / diasConDatos.length;
    const [diaTop, pctTop] = diasConDatos.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (promedio > 0) {
      const diferencia = Math.round(((pctTop - promedio) / promedio) * 100);
      insights.push(
        `${DIA_LABEL[Number(diaTop)]} es tu día de mayor demanda, ${diferencia}% por encima del promedio.`
      );
    }
  }

  const productosConDatos = Object.entries(input.distribucionProducto);
  if (productosConDatos.length > 0) {
    const [idTop, pctTop] = productosConDatos.reduce((a, b) => (b[1] > a[1] ? b : a));
    const nombre = input.productosDetalle[Number(idTop)] ?? `#${idTop}`;
    insights.push(`${nombre} es tu sabor de mayor rotación (${(pctTop * 100).toFixed(1)}% de la demanda total).`);
  }

  if (input.pendiente > 0.01) {
    insights.push("La demanda semanal viene con tendencia creciente en las últimas 8 semanas.");
  } else if (input.pendiente < -0.01) {
    insights.push("La demanda semanal viene con tendencia decreciente en las últimas 8 semanas.");
  }

  return insights;
}

export interface FilaPronosticoVsReal {
  fechaPlan: string;
  productoDetalle: string;
  demandaPronosticada: number;
  cantidadPlanificada: number;
  cantReal: string | null;
}

export async function listPronosticoVsReal(limite = 30): Promise<FilaPronosticoVsReal[]> {
  const result = await query<{
    fecha_plan: string;
    producto_detalle: string;
    demanda_pronosticada: string;
    cantidad_planificada: string;
    cant_real: string | null;
  }>(
    `SELECT f.fecha_plan::text AS fecha_plan, p.detalle AS producto_detalle, f.demanda_pronosticada,
            f.cantidad_planificada, o.cant_real
     FROM malaga.f_pcp_pronostico f
     JOIN malaga.d_productos p ON p.id_prod = f.id_prod
     LEFT JOIN malaga.f_ordenes_produccion o ON o.id_op = f.id_op_generada
     WHERE f.cantidad_planificada > 0
     ORDER BY f.ts_generado DESC
     LIMIT $1`,
    [limite]
  );
  return result.rows.map((r) => ({
    fechaPlan: r.fecha_plan,
    productoDetalle: r.producto_detalle,
    demandaPronosticada: Number(r.demanda_pronosticada),
    cantidadPlanificada: Number(r.cantidad_planificada),
    cantReal: r.cant_real,
  }));
}

export { getDistribucionPorDia, getDistribucionPorProducto };

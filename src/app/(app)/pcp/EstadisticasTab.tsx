import { getTendenciaSemanal, generarInsights, listPronosticoVsReal } from "@/lib/pcp/stats";
import { getDistribucionPorDia, getDistribucionPorProducto, getProductosEnCartilla } from "@/lib/pcp/queries";
import { getPronosticoClima } from "@/lib/pcp/weather";
import { formatFecha } from "@/lib/formatDate";
import { TrendChart } from "./charts/TrendChart";
import { BarDistribution } from "./charts/BarDistribution";

const DIA_LABEL: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
  7: "Dom",
};

export async function EstadisticasTab() {
  const [tendencia, distribucionDia, distribucionProducto, productosCartilla, clima, pronosticoVsReal] =
    await Promise.all([
      getTendenciaSemanal(),
      getDistribucionPorDia(8),
      getDistribucionPorProducto(8),
      getProductosEnCartilla(),
      getPronosticoClima(),
      listPronosticoVsReal(15),
    ]);

  const productosDetalle = Object.fromEntries(productosCartilla.map((p) => [p.idProd, p.detalle]));
  const insights = generarInsights({
    distribucionDia,
    distribucionProducto,
    productosDetalle,
    pendiente: tendencia.pendiente,
  });

  const itemsDia = Object.entries(distribucionDia)
    .map(([dia, pct]) => ({ label: DIA_LABEL[Number(dia)], pct }))
    .sort((a, b) => Number(a.label) - Number(b.label));
  const itemsProducto = Object.entries(distribucionProducto)
    .map(([idProd, pct]) => ({ label: productosDetalle[Number(idProd)] ?? `#${idProd}`, pct }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="flex flex-col gap-6">
      {insights.length > 0 && (
        <section className="card flex flex-col gap-1.5 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Insights</h2>
          <ul className="flex flex-col gap-1 text-sm text-ink">
            {insights.map((insight, i) => (
              <li key={i}>• {insight}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Tendencia semanal (8 semanas)</h2>
        <TrendChart puntos={tendencia.puntos} proyeccion={tendencia.proyeccionSemanaSiguiente} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Demanda por día de la semana</h2>
          <BarDistribution items={itemsDia} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Demanda por producto</h2>
          <BarDistribution items={itemsProducto} />
        </section>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Clima en Málaga</h2>
        <div className="card grid grid-cols-4 gap-2 p-4 sm:grid-cols-7">
          {clima.map((dia) => (
            <div key={dia.fecha} className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-[10px] text-ink-soft">{formatFecha(dia.fecha)}</span>
              <span className="font-mono text-sm font-semibold text-ink">{Math.round(dia.tempMax)}°</span>
              <span className="text-[10px] text-ink-soft">{Math.round(dia.tempMin)}°</span>
              <span className="text-[10px] text-ink-soft">{dia.condicion}</span>
            </div>
          ))}
          {clima.length === 0 && (
            <p className="col-span-full py-4 text-center text-sm text-ink-soft">
              No se pudo cargar el pronóstico ahora.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Pronóstico vs. real</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3.5 py-2.5">Fecha</th>
                <th className="px-3.5 py-2.5">Producto</th>
                <th className="px-3.5 py-2.5 text-right">Pronosticado</th>
                <th className="px-3.5 py-2.5 text-right">Planificado</th>
                <th className="px-3.5 py-2.5 text-right">Real</th>
              </tr>
            </thead>
            <tbody>
              {pronosticoVsReal.map((f, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3.5 py-2.5 text-ink-soft">{formatFecha(f.fechaPlan)}</td>
                  <td className="px-3.5 py-2.5 text-ink">{f.productoDetalle}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">
                    {f.demandaPronosticada.toFixed(2)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">
                    {f.cantidadPlanificada.toFixed(2)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{f.cantReal ?? "—"}</td>
                </tr>
              ))}
              {pronosticoVsReal.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3.5 py-6 text-center text-ink-soft">
                    Todavía no se generó ningún plan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

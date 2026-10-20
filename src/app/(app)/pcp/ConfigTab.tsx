import { getConfigPcp, listDemandaBase } from "@/lib/pcp/cierre-queries";
import { actualizarConfigPcpAction, actualizarDemandaBaseAction } from "./config-actions";

export async function ConfigTab() {
  const [config, demanda] = await Promise.all([getConfigPcp(), listDemandaBase()]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Margen y cobertura</h2>
        <form action={actualizarConfigPcpAction} className="card flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Margen de seguridad sobre la demanda (%)
            <input
              name="margenPct"
              required
              type="number"
              step="0.01"
              min="0"
              defaultValue={config.margenPct}
              className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            Días de cobertura de las bases
            <input
              name="diasCobertura"
              required
              type="number"
              step="0.01"
              min="0"
              defaultValue={config.diasCobertura}
              className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-sm"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
          >
            Guardar
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Demanda por sabor (kg por día)</h2>
        <div className="card flex max-h-[28rem] flex-col gap-2 overflow-y-auto p-4">
          {demanda.map((d) => (
            <form key={d.idProd} action={actualizarDemandaBaseAction} className="flex items-center justify-between gap-2">
              <input type="hidden" name="idProd" value={d.idProd} />
              <span className="truncate text-sm text-ink">{d.detalle}</span>
              <div className="flex flex-none items-center gap-1.5">
                <input
                  name="kgDia"
                  required
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={d.kgDia}
                  className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                />
                <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                  Guardar
                </button>
              </div>
            </form>
          ))}
          {demanda.length === 0 && <p className="text-sm text-ink-soft">No hay sabores en la cartilla todavía.</p>}
        </div>
      </section>
    </div>
  );
}

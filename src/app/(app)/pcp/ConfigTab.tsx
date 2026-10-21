import { getConfigPcp, listPctDia, listPctSabor } from "@/lib/pcp/cierre-queries";
import {
  actualizarConfigPcpAction,
  actualizarPctDiaAction,
  actualizarPctSaborAction,
} from "./config-actions";
import { TablaPct } from "./TablaPct";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export async function ConfigTab() {
  const [config, pctDia, pctSabor] = await Promise.all([getConfigPcp(), listPctDia(), listPctSabor()]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Demanda, margen y cobertura</h2>
          <form action={actualizarConfigPcpAction} className="card flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1 text-sm text-ink">
              Demanda semanal pronosticada (kg)
              <input
                name="demandaSemanalKg"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={config.demandaSemanalKg}
                className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-base sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Margen de seguridad sobre la demanda (%)
              <input
                name="margenPct"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={config.margenPct}
                className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-base sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Días de cobertura de las bases
              <input
                name="diasCobertura"
                type="number"
                step="0.01"
                min="0"
                max="60"
                required
                defaultValue={config.diasCobertura}
                className="w-32 rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-base sm:text-sm"
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
          <h2 className="mb-3 text-sm font-semibold text-ink">% de la semana por día</h2>
          <TablaPct
            filas={DIAS.map((dia, i) => ({ id: i + 1, etiqueta: dia, pct: pctDia[i] }))}
            action={actualizarPctDiaAction}
          />
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">% de venta por sabor</h2>
        <TablaPct
          filas={pctSabor.map((s) => ({ id: s.idProd, etiqueta: s.detalle, pct: s.pct }))}
          action={actualizarPctSaborAction}
          vacio="No hay sabores en la cartilla todavía."
        />
      </section>
    </div>
  );
}

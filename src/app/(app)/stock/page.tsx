import { listStockPtVivo, listStockSemiVivo } from "@/lib/stock/queries";
import { listPartidasEnObrador } from "@/lib/exhibidora/queries";
import { cerrarRemanenteAction, exhibirPartidaAction } from "./actions";

export default async function StockPage() {
  const [pt, semi, enObrador] = await Promise.all([
    listStockPtVivo(),
    listStockSemiVivo(),
    listPartidasEnObrador(),
  ]);

  return (
    <div className="p-10">
      <h1 className="mb-8 text-2xl font-semibold text-ink">Stock</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold text-ink">En obrador — sin exhibir</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3">Fecha fab.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {enObrador.map((p) => (
                <tr key={p.idPartida} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{p.productoDetalle}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{p.lote}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-soft">{p.cantidad}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.fechaFab}</td>
                  <td className="px-4 py-3">
                    {p.idExhibidoraDestino ? (
                      <form action={exhibirPartidaAction}>
                        <input type="hidden" name="idPartida" value={p.idPartida} />
                        <input type="hidden" name="idExhibidora" value={p.idExhibidoraDestino} />
                        <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                          Exhibir
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-warn">Sin slot asignado</span>
                    )}
                  </td>
                </tr>
              ))}
              {enObrador.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                    Nada esperando para exhibirse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold text-ink">Producto terminado — vigente</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3">Fecha fab.</th>
              </tr>
            </thead>
            <tbody>
              {pt.map((p) => (
                <tr key={p.idPartida} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{p.productoDetalle}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{p.lote}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-soft">{p.cantidad}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.fechaFab}</td>
                </tr>
              ))}
              {pt.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                    Sin stock de PT en vitrina todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Semielaborados — restante</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3 text-right">Inicial</th>
                <th className="px-4 py-3 text-right">Restante</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {semi.map((s) => (
                <tr key={s.idPartida} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{s.productoDetalle}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{s.lote}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-soft">{s.cantidadInicial}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-soft">{s.restante}</td>
                  <td className="px-4 py-3">
                    <form action={cerrarRemanenteAction} className="flex items-center gap-2">
                      <input type="hidden" name="idPartida" value={s.idPartida} />
                      <select
                        name="motivo"
                        className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs"
                        defaultValue="scrap"
                      >
                        <option value="scrap">Scrap</option>
                        <option value="vencido">Vencido</option>
                        <option value="ajuste">Ajuste</option>
                      </select>
                      <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                        Cerrar remanente
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {semi.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                    Sin stock de semielaborados todavía.
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

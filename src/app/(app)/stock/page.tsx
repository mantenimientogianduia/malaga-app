import { listStockPtVivo, listStockSemiVivo } from "@/lib/stock/queries";
import { listPartidasEnObrador } from "@/lib/exhibidora/queries";
import { cerrarRemanenteAction, exhibirPartidaAction } from "./actions";
import { IconTarget, IconLayers, IconFlask } from "@/components/icons";

export default async function StockPage() {
  const [pt, semi, enObrador] = await Promise.all([
    listStockPtVivo(),
    listStockSemiVivo(),
    listPartidasEnObrador(),
  ]);

  return (
    <div className="p-10">
      <div className="mb-8">
        <p className="page-eyebrow mb-1.5">Depósito</p>
        <h1 className="text-2xl font-semibold text-ink">Stock</h1>
      </div>

      <div className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card-raised flex items-center gap-4 p-5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-ok-tint text-ok">
            <IconTarget />
          </span>
          <div>
            <div className="font-mono text-2xl font-medium text-ink">{pt.length}</div>
            <div className="text-xs text-ink-soft">sabores en vitrina</div>
          </div>
        </div>
        <div className="card-raised flex items-center gap-4 p-5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-warn-tint text-warn">
            <IconLayers />
          </span>
          <div>
            <div className="font-mono text-2xl font-medium text-ink">{enObrador.length}</div>
            <div className="text-xs text-ink-soft">esperando para exhibir</div>
          </div>
        </div>
        <div className="card-raised flex items-center gap-4 p-5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
            <IconFlask />
          </span>
          <div>
            <div className="font-mono text-2xl font-medium text-ink">{semi.length}</div>
            <div className="text-xs text-ink-soft">partidas de base con stock</div>
          </div>
        </div>
      </div>

      {enObrador.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold text-ink">Esperando para exhibir</h2>
          <div className="card overflow-hidden">
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
                  <tr key={p.idPartida} className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
                    <td className="px-4 py-3 font-medium text-ink">{p.productoDetalle}</td>
                    <td className="px-4 py-3 font-mono text-ink-soft">{p.lote}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink-soft">{p.cantidad}</td>
                    <td className="px-4 py-3 text-ink-soft">{p.fechaFab}</td>
                    <td className="px-4 py-3">
                      {p.idExhibidoraDestino ? (
                        <form action={exhibirPartidaAction}>
                          <input type="hidden" name="idPartida" value={p.idPartida} />
                          <input type="hidden" name="idExhibidora" value={p.idExhibidoraDestino} />
                          <button
                            type="submit"
                            className="rounded-md bg-copper px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
                          >
                            Exhibir
                          </button>
                        </form>
                      ) : (
                        <span className="rounded-full bg-warn-tint px-2 py-0.5 text-[10px] font-semibold text-warn">
                          Sin slot asignado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-ink">En vitrina ahora</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pt.map((p) => (
            <div key={p.idPartida} className="card flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-copper-tint font-mono text-xs font-semibold text-copper-strong">
                {p.nroSlot ?? "—"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{p.productoDetalle}</div>
                <div className="font-mono text-xs text-ink-soft">{p.lote}</div>
              </div>
              <div className="font-mono text-sm font-medium text-ink">{p.cantidad}</div>
            </div>
          ))}
          {pt.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-ink-soft">
              Sin stock de PT en vitrina todavía.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Stock de bases</h2>
        <div className="flex flex-col gap-2">
          {semi.map((s) => {
            const inicial = Number(s.cantidadInicial);
            const restante = Number(s.restante);
            const pct = inicial > 0 ? Math.max(0, Math.min(100, (restante / inicial) * 100)) : 0;
            return (
              <div key={s.idPartida} className="card flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{s.productoDetalle}</span>
                    <span className="font-mono text-xs text-ink-soft">
                      {s.restante} / {s.cantidadInicial}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-copper transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] text-ink-soft">{s.lote}</div>
                </div>
                <form action={cerrarRemanenteAction} className="flex flex-none items-center gap-2">
                  <input type="hidden" name="idPartida" value={s.idPartida} />
                  <select
                    name="motivo"
                    className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs"
                    defaultValue="scrap"
                  >
                    <option value="scrap">Scrap</option>
                    <option value="vencido">Vencido</option>
                    <option value="ajuste">Ajuste</option>
                  </select>
                  <button
                    type="submit"
                    className="whitespace-nowrap text-xs font-medium text-copper hover:text-copper-strong"
                  >
                    Cerrar
                  </button>
                </form>
              </div>
            );
          })}
          {semi.length === 0 && (
            <p className="card py-6 text-center text-sm text-ink-soft">Sin stock de bases todavía.</p>
          )}
        </div>
      </section>
    </div>
  );
}

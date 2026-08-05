import Link from "next/link";
import { listStockPtVivo, listStockSemiVivo, getVejezPromedioPtVivo } from "@/lib/stock/queries";
import { listPartidasEnObrador } from "@/lib/exhibidora/queries";
import { cerrarRemanenteAction } from "./actions";
import { IconTarget, IconLayers, IconFlask } from "@/components/icons";

function diasDesde(fecha: string): number {
  const ms = Date.now() - new Date(`${fecha}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function vejezColor(dias: number): string {
  if (dias <= 2) return "text-ok";
  if (dias <= 5) return "text-warn";
  return "text-bad";
}

export default async function StockPage() {
  const [pt, semi, enObrador, vejezPromedio] = await Promise.all([
    listStockPtVivo(),
    listStockSemiVivo(),
    listPartidasEnObrador(),
    getVejezPromedioPtVivo(),
  ]);

  return (
    <div className="p-10">
      <div className="mb-8">
        <p className="page-eyebrow mb-1.5">Depósito</p>
        <h1 className="text-2xl font-semibold text-ink">Stock</h1>
      </div>

      {/* ---------- BACHAS ---------- */}
      <section className="mb-12">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
            <IconTarget />
          </span>
          <h2 className="text-base font-semibold text-ink">Bachas</h2>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card-raised flex flex-col justify-center p-5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">
              Vejez promedio del stock
            </div>
            <div className={`font-mono text-3xl font-semibold ${vejezPromedio !== null ? vejezColor(vejezPromedio) : "text-ink"}`}>
              {vejezPromedio !== null ? vejezPromedio.toFixed(1) : "—"}
              <span className="ml-1 text-sm font-normal text-ink-soft">días</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">ponderado por cantidad, sobre lo que está hoy en vitrina</p>
          </div>
          <div className="card-raised flex items-center gap-4 p-5">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-ok-tint text-ok">
              <IconTarget />
            </span>
            <div>
              <div className="font-mono text-2xl font-medium text-ink">{pt.length}</div>
              <div className="text-xs text-ink-soft">sabores en vitrina</div>
            </div>
          </div>
          <Link
            href="/exhibir"
            className="card-raised flex items-center gap-4 p-5 transition-colors hover:border-copper"
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-warn-tint text-warn">
              <IconLayers />
            </span>
            <div>
              <div className="font-mono text-2xl font-medium text-ink">{enObrador.length}</div>
              <div className="text-xs text-ink-soft">esperando exhibir · ir →</div>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pt.map((p) => {
            const dias = diasDesde(p.fechaFab);
            return (
              <div key={p.idPartida} className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-copper-tint font-mono text-[11px] font-semibold text-copper-strong">
                    {p.nroSlot ?? "—"}
                  </span>
                  <span className={`font-mono text-[11px] font-semibold ${vejezColor(dias)}`}>hace {dias}d</span>
                </div>
                <div className="truncate text-sm font-medium text-ink">{p.productoDetalle}</div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="font-mono text-xl font-semibold text-ink">{p.cantidad}</span>
                  <span className="text-xs text-ink-soft">{p.fechaFab}</span>
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-ink-soft">{p.lote}</div>
              </div>
            );
          })}
          {pt.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-ink-soft">
              Sin stock de PT en vitrina todavía.
            </p>
          )}
        </div>
      </section>

      {/* ---------- BASES ---------- */}
      <section>
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
            <IconFlask />
          </span>
          <h2 className="text-base font-semibold text-ink">Bases</h2>
        </div>

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

import { requireRole } from "@/lib/auth/requireRole";
import { listExhibicionesRecientes } from "@/lib/exhibidora/queries";
import { listOrdenesRecientes } from "@/lib/ordenes/queries";
import { listCierresRecientes } from "@/lib/stock/queries";
import { formatFechaHora } from "@/lib/formatDate";
import { IconHistory, IconStorefront, IconClipboard, IconFlask } from "@/components/icons";
import {
  deshacerExhibicionAction,
  cancelarOrdenAction,
  deshacerFinalizacionAction,
  deshacerCierreAction,
} from "./actions";

const MOTIVO_LABEL: Record<string, string> = {
  scrap: "Scrap",
  vencido: "Vencido",
  ajuste: "Ajuste",
};

export default async function AuditoriaPage() {
  await requireRole(["gestion", "admin"]);

  const [exhibiciones, ordenes, cierres] = await Promise.all([
    listExhibicionesRecientes(),
    listOrdenesRecientes(),
    listCierresRecientes(),
  ]);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
          <IconHistory className="h-4 w-4" />
        </span>
        <div>
          <p className="page-eyebrow leading-none">Corrección</p>
          <h1 className="text-xl font-semibold text-ink">Auditoría</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <IconStorefront className="h-4 w-4 text-copper" />
            <h2 className="text-sm font-semibold text-ink">Exhibiciones recientes</h2>
          </div>
          <div className="flex flex-col gap-2">
            {exhibiciones.map((e) => (
              <div key={e.idPartida} className="card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-ink">{e.productoDetalle}</div>
                  <div className="font-mono text-[10.5px] text-ink-soft">
                    {e.cantidad} · {formatFechaHora(e.tsExhibicion)}
                    {e.userExhibicion ? ` · ${e.userExhibicion}` : ""}
                  </div>
                </div>
                <form action={deshacerExhibicionAction} className="flex-none">
                  <input type="hidden" name="idPartida" value={e.idPartida} />
                  <button
                    type="submit"
                    className="whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-[10.5px] font-semibold text-ink-soft transition-colors hover:border-bad hover:text-bad"
                  >
                    Deshacer
                  </button>
                </form>
              </div>
            ))}
            {exhibiciones.length === 0 && (
              <p className="card py-6 text-center text-sm text-ink-soft">Sin exhibiciones registradas.</p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <IconClipboard className="h-4 w-4 text-copper" />
            <h2 className="text-sm font-semibold text-ink">Órdenes recientes</h2>
          </div>
          <div className="flex flex-col gap-2">
            {ordenes.map((o) => (
              <div key={o.idOp} className="card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-ink">
                    OP-{o.idOp} · {o.productoDetalle}
                  </div>
                  <div className="font-mono text-[10.5px] text-ink-soft">
                    {o.estado === "finalizada" ? o.cantReal : o.cantPlan} · {o.estado}
                  </div>
                </div>
                {o.estado === "planificada" ? (
                  <form action={cancelarOrdenAction} className="flex-none">
                    <input type="hidden" name="idOp" value={o.idOp} />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-[10.5px] font-semibold text-ink-soft transition-colors hover:border-bad hover:text-bad"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <form action={deshacerFinalizacionAction} className="flex-none">
                    <input type="hidden" name="idOp" value={o.idOp} />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-[10.5px] font-semibold text-ink-soft transition-colors hover:border-bad hover:text-bad"
                    >
                      Deshacer
                    </button>
                  </form>
                )}
              </div>
            ))}
            {ordenes.length === 0 && (
              <p className="card py-6 text-center text-sm text-ink-soft">Sin órdenes registradas.</p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <IconFlask className="h-4 w-4 text-copper" />
            <h2 className="text-sm font-semibold text-ink">Cierres de remanente recientes</h2>
          </div>
          <div className="flex flex-col gap-2">
            {cierres.map((c) => (
              <div key={c.idPartida} className="card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-ink">{c.productoDetalle}</div>
                  <div className="font-mono text-[10.5px] text-ink-soft">
                    {MOTIVO_LABEL[c.motivoBaja]} · {formatFechaHora(c.tsBajaManual)}
                    {c.userBajaManual ? ` · ${c.userBajaManual}` : ""}
                  </div>
                </div>
                <form action={deshacerCierreAction} className="flex-none">
                  <input type="hidden" name="idPartida" value={c.idPartida} />
                  <button
                    type="submit"
                    className="whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-[10.5px] font-semibold text-ink-soft transition-colors hover:border-bad hover:text-bad"
                  >
                    Deshacer
                  </button>
                </form>
              </div>
            ))}
            {cierres.length === 0 && (
              <p className="card py-6 text-center text-sm text-ink-soft">Sin cierres registrados.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

import { getPlanDelDia, type OpDelPlan } from "@/lib/pcp/cierre-queries";
import { fechaEnMalaga } from "@/lib/pcp/fechas";
import { formatFechaHora } from "@/lib/formatDate";

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

function ListaOps({ titulo, ops, unidad }: { titulo: string; ops: OpDelPlan[]; unidad: string }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-ink">{titulo}</h2>
      <div className="card p-4">
        {ops.length === 0 ? (
          <p className="text-sm text-ink-soft">Nada para hoy.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm text-ink">
            {ops.map((o) => (
              <li key={o.idOp} className="flex justify-between gap-3">
                <span>
                  {o.productoDetalle} <span className="font-mono text-xs text-ink-soft">OP-{o.idOp}</span>
                </span>
                <span className="font-mono">
                  {fmt(o.cantPlan)} {unidad}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export async function PlanDelDiaTab() {
  const plan = await getPlanDelDia(fechaEnMalaga());

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-ink-soft">
        {plan.cierre
          ? `Según el cierre de ${plan.cierre.userCierre ?? "—"} (${formatFechaHora(plan.cierre.tsCierre)}).`
          : "Todavía no se hizo el cierre del día anterior."}
      </p>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ListaOps titulo="Fabricar" ops={plan.fabricar} unidad="kg" />
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Descongelar</h2>
          <div className="card p-4">
            {plan.descongelar.length === 0 ? (
              <p className="text-sm text-ink-soft">Nada para descongelar.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm text-ink">
                {plan.descongelar.map((d) => (
                  <li key={d.idProd} className="flex justify-between gap-3">
                    <span>{d.detalle}</span>
                    <span className="font-mono">
                      {fmt(d.descongelar)} kg
                      {d.faltante > 0 && <span className="ml-2 font-semibold text-bad">faltan {fmt(d.faltante)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <ListaOps titulo="Cocinar" ops={plan.cocinar} unidad="kg" />
      </div>
    </div>
  );
}

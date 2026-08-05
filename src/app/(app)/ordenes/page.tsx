import Link from "next/link";
import { listOrdenes } from "@/lib/ordenes/queries";
import { formatFecha } from "@/lib/formatDate";

const ESTADO_LABEL: Record<string, string> = {
  planificada: "Planificada",
  en_proceso: "En proceso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export default async function OrdenesPage() {
  const ordenes = await listOrdenes();

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Órdenes de producción</h1>
        <Link
          href="/ordenes/nueva"
          className="rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white"
        >
          Nueva OP
        </Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
              <th className="px-3.5 py-2.5">OP</th>
              <th className="px-3.5 py-2.5">Producto</th>
              <th className="px-3.5 py-2.5 text-right">Plan</th>
              <th className="px-3.5 py-2.5 text-right">Real</th>
              <th className="px-3.5 py-2.5">Fecha plan</th>
              <th className="px-3.5 py-2.5">Estado</th>
              <th className="px-3.5 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => (
              <tr key={o.idOp} className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
                <td className="px-3.5 py-2.5 font-mono text-ink-soft">OP-{o.idOp}</td>
                <td className="px-3.5 py-2.5 font-medium text-ink">{o.productoDetalle}</td>
                <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{o.cantPlan}</td>
                <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{o.cantReal ?? "—"}</td>
                <td className="px-3.5 py-2.5 text-ink-soft">{formatFecha(o.fechaPlan)}</td>
                <td className="px-3.5 py-2.5 text-ink-soft">{ESTADO_LABEL[o.estado]}</td>
                <td className="px-3.5 py-2.5">
                  {o.estado === "planificada" && (
                    <Link
                      href={`/ordenes/${o.idOp}/finalizar`}
                      className="text-xs font-medium text-copper hover:text-copper-strong"
                    >
                      Finalizar
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {ordenes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3.5 py-8 text-center text-ink-soft">
                  Todavía no hay órdenes de producción.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

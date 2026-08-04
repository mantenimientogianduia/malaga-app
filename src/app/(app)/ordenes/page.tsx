import Link from "next/link";
import { listOrdenes } from "@/lib/ordenes/queries";

const ESTADO_LABEL: Record<string, string> = {
  planificada: "Planificada",
  en_proceso: "En proceso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export default async function OrdenesPage() {
  const ordenes = await listOrdenes();

  return (
    <div className="p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Órdenes de producción</h1>
        <Link
          href="/ordenes/nueva"
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white"
        >
          Nueva OP
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3">OP</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Plan</th>
              <th className="px-4 py-3 text-right">Real</th>
              <th className="px-4 py-3">Fecha plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => (
              <tr key={o.idOp} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-ink-soft">OP-{o.idOp}</td>
                <td className="px-4 py-3 font-medium text-ink">{o.productoDetalle}</td>
                <td className="px-4 py-3 text-right font-mono text-ink-soft">{o.cantPlan}</td>
                <td className="px-4 py-3 text-right font-mono text-ink-soft">{o.cantReal ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{o.fechaPlan}</td>
                <td className="px-4 py-3 text-ink-soft">{ESTADO_LABEL[o.estado]}</td>
                <td className="px-4 py-3">
                  {o.estado === "planificada" && (
                    <Link
                      href={`/ordenes/${o.idOp}/finalizar`}
                      className="text-sm font-medium text-copper hover:text-copper-strong"
                    >
                      Finalizar
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {ordenes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
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

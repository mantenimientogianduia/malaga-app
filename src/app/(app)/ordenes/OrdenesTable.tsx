import Link from "next/link";
import type { OrdenProduccion } from "@/lib/ordenes/queries";
import { formatFecha } from "@/lib/formatDate";
import { ElapsedClock } from "./ElapsedClock";
import { IniciarControls } from "./IniciarControls";

const ESTADO_LABEL: Record<string, string> = {
  planificada: "Planificada",
  en_proceso: "En proceso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

const ESTADO_CLASS: Record<string, string> = {
  planificada: "bg-surface-raised text-ink-soft",
  en_proceso: "bg-warn-tint text-warn",
  finalizada: "bg-ok-tint text-ok",
  cancelada: "bg-bad-tint text-bad",
};

export function OrdenesTable({
  ordenes,
  vacioTexto,
  columnaSector = false,
}: {
  ordenes: OrdenProduccion[];
  vacioTexto: string;
  columnaSector?: boolean;
}) {
  return (
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
            {columnaSector ? <th className="px-3.5 py-2.5">Sector</th> : <th className="px-3.5 py-2.5"></th>}
          </tr>
        </thead>
        <tbody>
          {ordenes.map((o) => (
            <tr
              key={o.idOp}
              className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised"
            >
              <td className="px-3.5 py-2.5 font-mono text-ink-soft">OP-{o.idOp}</td>
              <td className="px-3.5 py-2.5 font-medium text-ink">{o.productoDetalle}</td>
              <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{o.cantPlan}</td>
              <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{o.cantReal ?? "—"}</td>
              <td className="px-3.5 py-2.5 text-ink-soft">{formatFecha(o.fechaPlan)}</td>
              <td className="px-3.5 py-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ESTADO_CLASS[o.estado]}`}
                >
                  {ESTADO_LABEL[o.estado]}
                  {o.estado === "en_proceso" && o.tsIni && <ElapsedClock tsIni={o.tsIni} />}
                </span>
              </td>
              {columnaSector ? (
                <td className="px-3.5 py-2.5 text-ink-soft">{o.sector ?? "—"}</td>
              ) : (
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center gap-3">
                    {o.estado === "planificada" && <IniciarControls idOp={o.idOp} />}
                    {(o.estado === "planificada" || o.estado === "en_proceso") && (
                      <Link
                        href={`/ordenes/${o.idOp}/finalizar`}
                        prefetch={false}
                        className="whitespace-nowrap text-xs font-medium text-copper hover:text-copper-strong"
                      >
                        Finalizar
                      </Link>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {ordenes.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3.5 py-6 text-center text-ink-soft">
                {vacioTexto}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

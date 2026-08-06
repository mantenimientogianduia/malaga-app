import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { getFactoresDia, listFactoresProducto } from "@/lib/pcp/queries";
import { IconChevronLeft } from "@/components/icons";
import { actualizarFactorDiaAction, actualizarFactorProductoAction } from "./actions";

const DIA_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export default async function FactoresPcpPage() {
  await requireRole(["gestion", "admin"]);
  const [factoresDia, factoresProducto] = await Promise.all([getFactoresDia(), listFactoresProducto()]);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <Link
        href="/pcp"
        className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-copper"
      >
        <IconChevronLeft /> PCP
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-ink">Factores de ajuste</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Por día de la semana</h2>
          <div className="card flex flex-col gap-2 p-4">
            {factoresDia.map((f) => (
              <form
                key={f.diaSemana}
                action={actualizarFactorDiaAction}
                className="flex items-center justify-between gap-2"
              >
                <input type="hidden" name="diaSemana" value={f.diaSemana} />
                <span className="text-sm text-ink">{DIA_LABEL[f.diaSemana]}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    name="factor"
                    type="number"
                    step="0.01"
                    defaultValue={f.factor}
                    className="w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                  />
                  <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                    Guardar
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Por producto</h2>
          <div className="card flex max-h-[28rem] flex-col gap-2 overflow-y-auto p-4">
            {factoresProducto.map((f) => (
              <form
                key={f.idProd}
                action={actualizarFactorProductoAction}
                className="flex items-center justify-between gap-2"
              >
                <input type="hidden" name="idProd" value={f.idProd} />
                <span className="truncate text-sm text-ink">{f.productoDetalle}</span>
                <div className="flex flex-none items-center gap-1.5">
                  <input
                    name="factor"
                    type="number"
                    step="0.01"
                    defaultValue={f.factor}
                    className="w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                  />
                  <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
                    Guardar
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

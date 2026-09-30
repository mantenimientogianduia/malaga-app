import { requireRole } from "@/lib/auth/requireRole";
import { listSaboresParaQuiebre, listQuiebresAbiertos, listQuiebresResueltos } from "@/lib/quiebres/queries";
import { formatFechaHora } from "@/lib/formatDate";
import { IconAlert } from "@/components/icons";
import { QuiebreForm } from "./QuiebreForm";

export default async function QuiebresPage() {
  await requireRole(["gestion", "admin", "produccion"]);

  const [sabores, abiertos, resueltos] = await Promise.all([
    listSaboresParaQuiebre(),
    listQuiebresAbiertos(),
    listQuiebresResueltos(),
  ]);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bad-tint text-bad">
          <IconAlert className="h-4 w-4" />
        </span>
        <div>
          <p className="page-eyebrow leading-none">Vitrina</p>
          <h1 className="text-xl font-semibold text-ink">Quiebres</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Cargar quiebre</h2>
          <QuiebreForm sabores={sabores} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Quiebres abiertos</h2>
          <div className="flex flex-col gap-2">
            {abiertos.map((q) => (
              <div key={q.idQuiebre} className="card p-3">
                <div className="text-sm font-medium text-ink">{q.productoDetalle}</div>
                <div className="font-mono text-[10.5px] text-ink-soft">
                  Desde {formatFechaHora(q.tsQuiebreReal)}
                  {q.userCarga ? ` · cargado por ${q.userCarga}` : ""}
                </div>
              </div>
            ))}
            {abiertos.length === 0 && (
              <p className="card py-6 text-center text-sm text-ink-soft">No hay quiebres abiertos.</p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Historial de resueltos</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3.5 py-2.5">Sabor</th>
                <th className="px-3.5 py-2.5">Desde</th>
                <th className="px-3.5 py-2.5">Repuesto</th>
                <th className="px-3.5 py-2.5 text-right">Tardó</th>
              </tr>
            </thead>
            <tbody>
              {resueltos.map((q) => (
                <tr
                  key={q.idQuiebre}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-3.5 py-2.5 font-medium text-ink">{q.productoDetalle}</td>
                  <td className="px-3.5 py-2.5 text-ink-soft">{formatFechaHora(q.tsQuiebreReal)}</td>
                  <td className="px-3.5 py-2.5 text-ink-soft">{formatFechaHora(q.tsRepuesto)}</td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">
                    {q.minutosResolucion < 60
                      ? `${q.minutosResolucion} min`
                      : `${(q.minutosResolucion / 60).toFixed(1)} h`}
                  </td>
                </tr>
              ))}
              {resueltos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3.5 py-6 text-center text-ink-soft">
                    Todavía no se resolvió ningún quiebre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

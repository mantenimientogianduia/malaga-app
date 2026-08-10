import { requireRole } from "@/lib/auth/requireRole";
import { calcularPlanManana } from "@/lib/pcp/queries";
import { PlanRevisionForm } from "./PlanRevisionForm";
import { EstadisticasTab } from "./EstadisticasTab";
import { PcpTabs } from "./PcpTabs";

export default async function PcpPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; factor?: string }>;
}) {
  await requireRole(["gestion", "admin"]);
  const { tab, factor: factorRaw } = await searchParams;
  const vistaEstadisticas = tab === "estadisticas";
  const factor = factorRaw ? Number(factorRaw) : 1;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-5">
        <p className="page-eyebrow mb-1">Cierre del día</p>
        <h1 className="text-xl font-semibold text-ink">PCP</h1>
      </div>

      <PcpTabs activa={vistaEstadisticas ? "estadisticas" : "plan"} />

      <div className="mt-5">
        {vistaEstadisticas ? (
          <EstadisticasTab />
        ) : (
          <PlanRevisionForm filas={await calcularPlanManana(factor)} factor={factor} />
        )}
      </div>
    </div>
  );
}

import { requireRole } from "@/lib/auth/requireRole";
import { calcularPlanManana } from "@/lib/pcp/queries";
import { PlanRevisionForm } from "./PlanRevisionForm";

export default async function PcpPage({
  searchParams,
}: {
  searchParams: Promise<{ factor?: string }>;
}) {
  await requireRole(["gestion", "admin"]);
  const { factor: factorRaw } = await searchParams;
  const factor = factorRaw ? Number(factorRaw) : 1;
  const filas = await calcularPlanManana(factor);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6">
        <p className="page-eyebrow mb-1">Cierre del día</p>
        <h1 className="text-xl font-semibold text-ink">PCP — Plan de mañana</h1>
      </div>

      <PlanRevisionForm filas={filas} factor={factor} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { getDatosCierre } from "@/lib/pcp/cierre-queries";
import { CierreDiaForm } from "./CierreDiaForm";
import { ConfigTab } from "./ConfigTab";
import { EstadisticasTab } from "./EstadisticasTab";
import { PcpTabs, type PestaniaPcp } from "./PcpTabs";
import { PlanDelDiaTab } from "./PlanDelDiaTab";

export default async function PcpPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireRole(["gestion", "admin", "produccion"]);
  const esGestion = user.rol === "gestion" || user.rol === "admin";
  const { tab } = await searchParams;

  if ((tab === "config" || tab === "estadisticas") && !esGestion) redirect("/pcp");

  const activa: PestaniaPcp =
    tab === "plan" ? "plan" : tab === "config" ? "config" : tab === "estadisticas" ? "estadisticas" : "cierre";

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-5">
        <p className="page-eyebrow mb-1">Cierre del día</p>
        <h1 className="text-xl font-semibold text-ink">PCP</h1>
      </div>

      <PcpTabs activa={activa} esGestion={esGestion} />

      <div className="mt-5">
        {activa === "cierre" && <CierreDiaForm datos={await getDatosCierre()} />}
        {activa === "plan" && <PlanDelDiaTab />}
        {activa === "config" && <ConfigTab />}
        {activa === "estadisticas" && <EstadisticasTab />}
      </div>
    </div>
  );
}

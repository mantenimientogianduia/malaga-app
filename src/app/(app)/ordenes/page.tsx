import Link from "next/link";
import { listOrdenes } from "@/lib/ordenes/queries";
import { IconClipboard } from "@/components/icons";
import { OrdenesTable } from "./OrdenesTable";

export default async function OrdenesPage() {
  const ordenes = await listOrdenes();

  const activas = ordenes.filter((o) => o.estado === "planificada" || o.estado === "en_proceso");
  const historial = ordenes.filter((o) => o.estado === "finalizada" || o.estado === "cancelada");

  const activasCoccion = activas.filter((o) => o.sector === "COCCION");
  const activasFabricacion = activas.filter((o) => o.sector === "FABRICACION");
  const activasSinSector = activas.filter((o) => o.sector !== "COCCION" && o.sector !== "FABRICACION");

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
            <IconClipboard className="h-4 w-4" />
          </span>
          <div>
            <p className="page-eyebrow leading-none">Producción</p>
            <h1 className="text-xl font-semibold text-ink">Órdenes de producción</h1>
          </div>
        </div>
        <Link
          href="/ordenes/nueva"
          className="rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
        >
          Nueva OP
        </Link>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Pendientes y en proceso</h2>
        <span className="rounded-full bg-warn-tint px-2 py-0.5 text-[10.5px] font-semibold text-warn">
          {activas.length}
        </span>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Cocción</p>
          <OrdenesTable ordenes={activasCoccion} vacioTexto="Sin órdenes pendientes de cocción." />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Fabricación</p>
          <OrdenesTable ordenes={activasFabricacion} vacioTexto="Sin órdenes pendientes de fabricación." />
        </div>
      </div>

      {activasSinSector.length > 0 && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Sin sector</p>
          <OrdenesTable ordenes={activasSinSector} vacioTexto="" />
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Historial</h2>
        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">
          {historial.length}
        </span>
      </div>
      <OrdenesTable
        ordenes={historial}
        vacioTexto="Todavía no hay órdenes finalizadas ni canceladas."
        columnaSector
      />
    </div>
  );
}

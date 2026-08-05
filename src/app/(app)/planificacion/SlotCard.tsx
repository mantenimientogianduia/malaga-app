import Link from "next/link";
import type { SlotPlanificacion } from "@/lib/exhibidora/queries";
import type { Producto } from "@/lib/productos/queries";
import { cambiarSaborAction, actualizarMinimoAction } from "./actions";

export function SlotCard({ slot, productosPT }: { slot: SlotPlanificacion; productosPT: Producto[] }) {
  const faltante = Number(slot.faltante);
  const estado = slot.bachasSugeridas > 0 ? (faltante > Number(slot.cantidadMinima) * 0.5 ? "bad" : "warn") : "ok";
  const colorClass = estado === "bad" ? "text-bad" : estado === "warn" ? "text-warn" : "text-ok";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-ink-soft">Slot {slot.nro}</span>
        {slot.bachasSugeridas > 0 && (
          <Link
            href={`/ordenes/nueva?idProd=${slot.idProd}`}
            className={`text-[10.5px] font-semibold ${colorClass} hover:underline`}
          >
            Producir {slot.bachasSugeridas} OP
          </Link>
        )}
      </div>

      <div className="mb-3 text-sm font-semibold text-ink">{slot.productoDetalle}</div>

      <div className="mb-3 flex items-baseline gap-2 font-mono text-xs text-ink-soft">
        <span className={colorClass}>{slot.stockActual}</span>
        <span>/ mín. {slot.cantidadMinima} kg</span>
      </div>

      <form action={actualizarMinimoAction} className="mb-2 flex gap-2">
        <input type="hidden" name="idExhibidora" value={slot.idExhibidora} />
        <input
          name="cantidadMinima"
          type="number"
          step="0.001"
          defaultValue={slot.cantidadMinima}
          className="w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs"
        />
        <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
          Guardar mín.
        </button>
      </form>

      <form action={cambiarSaborAction} className="flex gap-2">
        <input type="hidden" name="idExhibidora" value={slot.idExhibidora} />
        <select
          name="idProdNuevo"
          defaultValue=""
          className="flex-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs"
        >
          <option value="" disabled>
            Cambiar sabor...
          </option>
          {productosPT.map((p) => (
            <option key={p.idProd} value={p.idProd}>
              {p.detalle}
            </option>
          ))}
        </select>
        <button type="submit" className="text-xs font-medium text-copper hover:text-copper-strong">
          Aplicar
        </button>
      </form>
    </div>
  );
}

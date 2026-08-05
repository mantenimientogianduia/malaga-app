import { listPlanificacion } from "@/lib/exhibidora/queries";
import { listProductos } from "@/lib/productos/queries";
import { SlotCard } from "./SlotCard";

export default async function PlanificacionPage() {
  const [slots, productos] = await Promise.all([listPlanificacion(), listProductos()]);
  const productosPT = productos.filter((p) => p.tipoProducto === "PT");
  const conFaltante = slots.filter((s) => s.bachasSugeridas > 0).length;

  return (
    <div className="p-10">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-ink">Planificación diaria</h1>
        <span className="text-sm text-ink-soft">
          {conFaltante} de {slots.length} slots por debajo del mínimo
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {slots.map((slot) => (
          <SlotCard key={slot.idExhibidora} slot={slot} productosPT={productosPT} />
        ))}
      </div>
    </div>
  );
}

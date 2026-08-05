import { listCartillaActual } from "@/lib/exhibidora/queries";
import { listProductos } from "@/lib/productos/queries";
import { CartillaGrid } from "./CartillaGrid";

export default async function CartillaActualPage() {
  const [slots, productos] = await Promise.all([listCartillaActual(), listProductos()]);

  const idsEnCartilla = new Set(slots.map((s) => s.idProd));
  const productosDisponibles = productos.filter((p) => p.tipoProducto === "PT" && !idsEnCartilla.has(p.idProd));

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6">
        <p className="page-eyebrow mb-1">Exhibidora · 24 posiciones</p>
        <h1 className="text-xl font-semibold text-ink">Cartilla actual</h1>
      </div>

      <CartillaGrid slots={slots} productosDisponibles={productosDisponibles} />
    </div>
  );
}

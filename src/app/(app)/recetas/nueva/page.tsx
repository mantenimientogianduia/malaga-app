import { listProductos } from "@/lib/productos/queries";
import { RecetaForm } from "./RecetaForm";

export default async function NuevaRecetaPage() {
  const productos = await listProductos();

  return (
    <div className="p-10">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Nueva receta</h1>
      <RecetaForm productos={productos} />
    </div>
  );
}

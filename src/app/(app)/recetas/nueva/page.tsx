import { listProductos } from "@/lib/productos/queries";
import { RecetaForm } from "./RecetaForm";

export default async function NuevaRecetaPage() {
  const productos = await listProductos();

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <h1 className="mb-5 text-xl font-semibold text-ink">Nueva receta</h1>
      <RecetaForm productos={productos} />
    </div>
  );
}

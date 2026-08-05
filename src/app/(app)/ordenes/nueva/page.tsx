import { listProductosParaOrden } from "@/lib/ordenes/queries";
import { NuevaOrdenForm } from "./NuevaOrdenForm";

export default async function NuevaOrdenPage() {
  const productos = await listProductosParaOrden();

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <h1 className="mb-5 text-xl font-semibold text-ink">Nueva orden de producción</h1>
      <NuevaOrdenForm productos={productos} />
    </div>
  );
}

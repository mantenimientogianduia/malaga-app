import { listProductosConRecetaActiva } from "@/lib/ordenes/queries";
import { NuevaOrdenForm } from "./NuevaOrdenForm";

export default async function NuevaOrdenPage() {
  const productos = await listProductosConRecetaActiva();

  return (
    <div className="p-10">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Nueva orden de producción</h1>
      <NuevaOrdenForm productos={productos} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getProducto, listProductos } from "@/lib/productos/queries";
import { getRecetaActivaPorProducto } from "@/lib/recetas/queries";
import { IconChevronLeft } from "@/components/icons";
import { RecetaEditForm } from "./RecetaEditForm";

export default async function EditarRecetaPage({
  params,
}: {
  params: Promise<{ idProd: string }>;
}) {
  const { idProd } = await params;
  const idProdNum = Number(idProd);
  const producto = await getProducto(idProdNum);
  if (!producto) notFound();

  const [receta, productos] = await Promise.all([
    getRecetaActivaPorProducto(idProdNum),
    listProductos(),
  ]);

  return (
    <div className="p-10">
      <Link
        href={`/productos/${idProdNum}`}
        className="mb-6 inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-copper"
      >
        <IconChevronLeft /> {producto.detalle}
      </Link>

      <p className="page-eyebrow mb-1.5">{receta ? "Editar receta" : "Nueva receta"}</p>
      <h1 className="mb-6 font-display text-3xl italic text-ink">{producto.detalle}</h1>

      <RecetaEditForm idProd={idProdNum} productos={productos} recetaActual={receta} />
    </div>
  );
}

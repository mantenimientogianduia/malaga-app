import { notFound } from "next/navigation";
import { getOrdenParaFinalizar } from "@/lib/ordenes/queries";
import { FinalizarForm } from "./FinalizarForm";

export default async function FinalizarOrdenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orden = await getOrdenParaFinalizar(Number(id));
  if (!orden) notFound();

  return (
    <div className="p-10">
      <h1 className="mb-1 text-2xl font-semibold text-ink">Finalizar OP-{orden.idOp}</h1>
      <p className="mb-6 text-sm text-ink-soft">{orden.productoDetalle}</p>
      <FinalizarForm orden={orden} />
    </div>
  );
}

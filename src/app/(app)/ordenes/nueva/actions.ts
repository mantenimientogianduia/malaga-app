"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { createOrdenProduccion, listProductosParaOrden } from "@/lib/ordenes/queries";
import { listIdsEnCartillaOProgramados } from "@/lib/exhibidora/queries";

export async function crearOrdenAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  await requireRole(["gestion", "admin", "produccion"]);

  const idProd = Number(formData.get("idProd"));
  const cantPlan = Number(formData.get("cantPlan"));
  const fechaPlan = String(formData.get("fechaPlan") ?? "");

  if (!idProd || !cantPlan || cantPlan <= 0 || !fechaPlan) {
    return { error: "Completá producto, cantidad y fecha planificada." };
  }

  const [productos, idsEnCartilla] = await Promise.all([
    listProductosParaOrden(),
    listIdsEnCartillaOProgramados(),
  ]);
  const producto = productos.find((p) => p.idProd === idProd);
  if (producto?.tipoProducto === "PT" && !idsEnCartilla.includes(idProd)) {
    return { error: "Ese sabor no está en la cartilla actual ni tiene un cambio programado." };
  }

  try {
    await createOrdenProduccion({ idProd, cantPlan, fechaPlan });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear la OP." };
  }

  redirect("/ordenes");
}

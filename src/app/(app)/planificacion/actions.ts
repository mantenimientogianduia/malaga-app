"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { actualizarMinimo, cambiarSaborSlot } from "@/lib/exhibidora/queries";

export async function cambiarSaborAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  const idProdNuevo = Number(formData.get("idProdNuevo"));
  if (!idExhibidora || !idProdNuevo) return;
  await cambiarSaborSlot(idExhibidora, idProdNuevo);
  revalidatePath("/planificacion");
}

export async function actualizarMinimoAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  const cantidadMinima = Number(formData.get("cantidadMinima"));
  if (!idExhibidora || Number.isNaN(cantidadMinima) || cantidadMinima < 0) return;
  await actualizarMinimo(idExhibidora, cantidadMinima);
  revalidatePath("/planificacion");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { programarCambio, cancelarCambioProgramado } from "@/lib/exhibidora/queries";

export async function programarCambioAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  const idProdNuevo = Number(formData.get("idProdNuevo"));
  const fechaProgramada = String(formData.get("fechaProgramada") ?? "");
  if (!idExhibidora || !idProdNuevo || !fechaProgramada) return;

  await programarCambio(idExhibidora, idProdNuevo, fechaProgramada);
  revalidatePath("/planificacion");
}

export async function cancelarCambioProgramadoAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idExhibidora = Number(formData.get("idExhibidora"));
  if (!idExhibidora) return;

  await cancelarCambioProgramado(idExhibidora);
  revalidatePath("/planificacion");
}

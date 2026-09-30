"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { exhibirPartida } from "@/lib/exhibidora/queries";

export async function exhibirPartidaAction(formData: FormData) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const idExhibidora = Number(formData.get("idExhibidora"));
  const oficializarCambioAhora = formData.get("oficializarCambioAhora") === "on";
  if (!idPartida || !idExhibidora) return;

  await exhibirPartida(idPartida, idExhibidora, user.idUser, oficializarCambioAhora);
  revalidatePath("/exhibir");
  revalidatePath("/planificacion");
  revalidatePath("/stock");
}

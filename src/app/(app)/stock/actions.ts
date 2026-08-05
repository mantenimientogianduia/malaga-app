"use server";

import { requireRole } from "@/lib/auth/requireRole";
import { cerrarRemanenteSemi, type MotivoBaja } from "@/lib/stock/queries";
import { exhibirPartida } from "@/lib/exhibidora/queries";
import { revalidatePath } from "next/cache";

export async function cerrarRemanenteAction(formData: FormData) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const motivo = String(formData.get("motivo") ?? "") as MotivoBaja;

  if (!idPartida || !["scrap", "vencido", "ajuste"].includes(motivo)) {
    return;
  }

  await cerrarRemanenteSemi(idPartida, motivo, user.idUser);
  revalidatePath("/stock");
}

export async function exhibirPartidaAction(formData: FormData) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const idExhibidora = Number(formData.get("idExhibidora"));
  if (!idPartida || !idExhibidora) return;

  await exhibirPartida(idPartida, idExhibidora, user.idUser);
  revalidatePath("/stock");
}

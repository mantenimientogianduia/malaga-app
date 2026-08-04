"use server";

import { requireRole } from "@/lib/auth/requireRole";
import { cerrarRemanenteSemi, type MotivoBaja } from "@/lib/stock/queries";
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

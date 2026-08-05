"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { iniciarOrdenRapido, iniciarOrdenConHorario } from "@/lib/ordenes/queries";

export async function iniciarRapidoAction(formData: FormData) {
  const user = await requireRole(["gestion", "admin", "produccion"]);
  const idOp = Number(formData.get("idOp"));
  if (!idOp) return;

  await iniciarOrdenRapido(idOp, user.idUser);
  revalidatePath("/ordenes");
}

export async function iniciarConHorarioAction(formData: FormData) {
  const user = await requireRole(["gestion", "admin", "produccion"]);
  const idOp = Number(formData.get("idOp"));
  const horario = String(formData.get("horario") ?? "");
  if (!idOp || !horario) return;

  await iniciarOrdenConHorario(idOp, horario, user.idUser);
  revalidatePath("/ordenes");
}

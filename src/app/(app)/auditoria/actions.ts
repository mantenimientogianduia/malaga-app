"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { deshacerExhibicion } from "@/lib/exhibidora/queries";
import { cancelarOrdenPlanificada, deshacerInicio, deshacerFinalizacion } from "@/lib/ordenes/queries";
import { deshacerCierreRemanente } from "@/lib/stock/queries";

export async function deshacerExhibicionAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idPartida = Number(formData.get("idPartida"));
  if (!idPartida) return;

  await deshacerExhibicion(idPartida);
  revalidatePath("/auditoria");
  revalidatePath("/exhibir");
  revalidatePath("/stock");
}

export async function cancelarOrdenAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idOp = Number(formData.get("idOp"));
  if (!idOp) return;

  await cancelarOrdenPlanificada(idOp);
  revalidatePath("/auditoria");
  revalidatePath("/ordenes");
}

export async function deshacerInicioAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idOp = Number(formData.get("idOp"));
  if (!idOp) return;

  await deshacerInicio(idOp);
  revalidatePath("/auditoria");
  revalidatePath("/ordenes");
}

export async function deshacerFinalizacionAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idOp = Number(formData.get("idOp"));
  if (!idOp) return;

  await deshacerFinalizacion(idOp);
  revalidatePath("/auditoria");
  revalidatePath("/ordenes");
  revalidatePath("/stock");
}

export async function deshacerCierreAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idPartida = Number(formData.get("idPartida"));
  if (!idPartida) return;

  await deshacerCierreRemanente(idPartida);
  revalidatePath("/auditoria");
  revalidatePath("/stock");
}

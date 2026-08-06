"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { setFactorDia, setFactorProducto } from "@/lib/pcp/queries";

export async function actualizarFactorDiaAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const diaSemana = Number(formData.get("diaSemana"));
  const factor = Number(formData.get("factor"));
  if (!diaSemana || Number.isNaN(factor) || factor < 0) return;

  await setFactorDia(diaSemana, factor);
  revalidatePath("/pcp/factores");
}

export async function actualizarFactorProductoAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idProd = Number(formData.get("idProd"));
  const factor = Number(formData.get("factor"));
  if (!idProd || Number.isNaN(factor) || factor < 0) return;

  await setFactorProducto(idProd, factor);
  revalidatePath("/pcp/factores");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { crearQuiebre } from "@/lib/quiebres/queries";

export async function crearQuiebreAction(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idProd = Number(formData.get("idProd"));
  const tsQuiebreReal = String(formData.get("tsQuiebreReal") ?? "");

  if (!idProd || !tsQuiebreReal) {
    return { error: "Elegí un sabor y la fecha/hora real del quiebre." };
  }

  try {
    await crearQuiebre(idProd, tsQuiebreReal, user.idUser);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo cargar el quiebre." };
  }

  revalidatePath("/quiebres");
  return { success: true };
}

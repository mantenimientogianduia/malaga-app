"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { registrarTemperatura, updateConfigTemperaturas } from "@/lib/temperaturas/queries";

export async function registrarTemperaturaAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPunto = Number(formData.get("idPunto"));
  const temperatura = Number(formData.get("temperatura"));

  if (!idPunto || Number.isNaN(temperatura)) {
    return { error: "Completá la temperatura." };
  }

  try {
    await registrarTemperatura(idPunto, temperatura, user.idUser);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo registrar la temperatura." };
  }

  revalidatePath("/temperaturas");
  revalidatePath("/");
  return {};
}

export async function actualizarConfigTemperaturasAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  await requireRole(["gestion", "admin"]);

  const tempMin = Number(formData.get("tempMin"));
  const tempMax = Number(formData.get("tempMax"));

  if (Number.isNaN(tempMin) || Number.isNaN(tempMax) || tempMin >= tempMax) {
    return { error: "El mínimo tiene que ser menor que el máximo." };
  }

  await updateConfigTemperaturas(tempMin, tempMax);
  revalidatePath("/temperaturas");
  return {};
}

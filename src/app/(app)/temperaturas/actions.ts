"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import {
  registrarTemperatura,
  editarTemperatura,
  updateConfigTemperaturas,
  cerrarDia,
  reabrirDia,
  type DetalleRegistro,
} from "@/lib/temperaturas/queries";

type MedicionLeida = { temperatura: number; detalle: DetalleRegistro } | { error: string };

// Lee y valida lo que tienen en común cargar y editar una medición.
function leerMedicion(formData: FormData): MedicionLeida {
  const temperatura = Number(formData.get("temperatura"));
  const idProd = Number(formData.get("idProd"));
  const analisis = String(formData.get("analisis") ?? "");
  const observacion = String(formData.get("observacion") ?? "");

  if (String(formData.get("temperatura") ?? "").trim() === "" || Number.isNaN(temperatura)) {
    return { error: "Completá la temperatura." };
  }
  if (!idProd) {
    return { error: "Elegí el sabor que medís." };
  }
  if (analisis !== "ok" && analisis !== "no_ok") {
    return { error: "Indicá el análisis sensorial/visual: OK o No OK." };
  }
  return {
    temperatura,
    detalle: {
      idProd,
      analisisOk: analisis === "ok",
      observacion: observacion.trim() === "" ? null : observacion,
    },
  };
}

export async function registrarTemperaturaAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPunto = Number(formData.get("idPunto"));
  if (!idPunto) {
    return { error: "Completá la temperatura." };
  }
  const medicion = leerMedicion(formData);
  if ("error" in medicion) return { error: medicion.error };

  try {
    await registrarTemperatura(idPunto, medicion.temperatura, user.idUser, medicion.detalle);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo registrar la temperatura." };
  }

  revalidatePath("/temperaturas");
  revalidatePath("/");
  return {};
}

export async function editarTemperaturaAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idRegistro = Number(formData.get("idRegistro"));
  if (!idRegistro) {
    return { error: "No se encontró la medición a editar." };
  }
  const medicion = leerMedicion(formData);
  if ("error" in medicion) return { error: medicion.error };

  try {
    await editarTemperatura(idRegistro, medicion.temperatura, user.idUser, medicion.detalle);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo editar la medición." };
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

export async function cerrarDiaTemperaturasAction(
  _prevState: { error?: string } | undefined,
  _formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  try {
    await cerrarDia(user.idUser);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo cerrar el día." };
  }

  revalidatePath("/temperaturas");
  revalidatePath("/");
  return {};
}

export async function reabrirDiaTemperaturasAction(
  _prevState: { error?: string } | undefined,
  _formData: FormData
) {
  await requireRole(["gestion", "admin"]);

  try {
    await reabrirDia();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo reabrir el día." };
  }

  revalidatePath("/temperaturas");
  revalidatePath("/");
  return {};
}

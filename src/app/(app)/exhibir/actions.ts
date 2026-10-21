"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { exhibirPartida, darDeBajaBachaPt } from "@/lib/exhibidora/queries";
import type { MotivoBaja } from "@/lib/stock/queries";

type Estado = { error?: string; ok?: boolean } | undefined;

function revalidarTodo() {
  revalidatePath("/exhibir");
  revalidatePath("/planificacion");
  revalidatePath("/stock");
  revalidatePath("/auditoria");
  revalidatePath("/pcp");
}

export async function exhibirPartidaAction(_prevState: Estado, formData: FormData): Promise<Estado> {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const idExhibidora = Number(formData.get("idExhibidora"));
  const oficializarCambioAhora = formData.get("oficializarCambioAhora") === "on";
  const tsRaw = String(formData.get("tsExhibicion") ?? "").trim();
  if (!idPartida || !idExhibidora) return { error: "Faltan datos de la bacha." };

  try {
    await exhibirPartida(idPartida, idExhibidora, user.idUser, oficializarCambioAhora, tsRaw === "" ? null : tsRaw);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo exhibir la bacha." };
  }

  revalidarTodo();
  return { ok: true };
}

export async function darDeBajaBachaAction(_prevState: Estado, formData: FormData): Promise<Estado> {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idPartida = Number(formData.get("idPartida"));
  const motivo = String(formData.get("motivo") ?? "") as MotivoBaja;
  const observacion = String(formData.get("observacion") ?? "");
  if (!idPartida) return { error: "Faltan datos de la bacha." };

  try {
    await darDeBajaBachaPt(idPartida, motivo, observacion, user.idUser);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo dar de baja la bacha." };
  }

  revalidarTodo();
  return { ok: true };
}

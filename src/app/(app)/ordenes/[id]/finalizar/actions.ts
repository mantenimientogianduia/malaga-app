"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { finalizarOrden } from "@/lib/ordenes/queries";

export async function finalizarOrdenAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const idOp = Number(formData.get("idOp"));
  const cantReal = Number(formData.get("cantReal"));
  const lote = String(formData.get("lote") ?? "").trim();
  const fechaFab = String(formData.get("fechaFab") ?? "");

  const idsDetalleReceta = formData.getAll("idDetalleReceta").map(Number);
  const idsSubprod = formData.getAll("idSubprod").map(Number);
  const idsPartida = formData.getAll("idPartidaSubprod").map(Number);
  const cantidades = formData.getAll("cantConsumo").map(Number);

  if (!idOp || !cantReal || cantReal <= 0 || !lote || !fechaFab) {
    return { error: "Completá cantidad real, lote y fecha de fabricación." };
  }

  if (idsPartida.some((id) => !id)) {
    return { error: "Todos los ingredientes necesitan una partida elegida (no hay stock cargado de alguno)." };
  }

  const consumos = idsDetalleReceta.map((idDetalleReceta, i) => ({
    idDetalleReceta,
    idSubprod: idsSubprod[i],
    idPartidaSubprod: idsPartida[i],
    cantSubprod: cantidades[i],
  }));

  try {
    await finalizarOrden({ idOp, cantReal, lote, fechaFab, userFin: user.idUser, consumos });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo finalizar la OP." };
  }

  redirect("/ordenes");
}

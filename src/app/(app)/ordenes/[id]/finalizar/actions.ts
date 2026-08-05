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
  const tsIni = String(formData.get("tsIni") ?? "");
  const tsFin = String(formData.get("tsFin") ?? "");
  const tsFinLocal = String(formData.get("tsFinLocal") ?? "");

  const idsDetalleReceta = formData.getAll("idDetalleReceta").map(Number);
  const idsSubprod = formData.getAll("idSubprod").map(Number);
  const idsPartida = formData.getAll("idPartidaSubprod").map((v) => (v ? Number(v) : null));
  const cantidades = formData.getAll("cantConsumo").map(Number);

  if (!idOp || !cantReal || cantReal <= 0 || !tsIni || !tsFin || !tsFinLocal) {
    return { error: "Completá cantidad real, hora de inicio y hora de fin." };
  }

  const consumos = idsDetalleReceta.map((idDetalleReceta, i) => ({
    idDetalleReceta,
    idSubprod: idsSubprod[i],
    idPartidaSubprod: idsPartida[i] || null,
    cantSubprod: cantidades[i],
  }));

  try {
    await finalizarOrden({ idOp, cantReal, tsIni, tsFin, tsFinLocal, userFin: user.idUser, consumos });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo finalizar la OP." };
  }

  redirect("/ordenes");
}

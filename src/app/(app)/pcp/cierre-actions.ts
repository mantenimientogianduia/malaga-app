"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { confirmarCierre } from "@/lib/pcp/cierre-queries";
import { fechaEnMalaga, mananaEnMalaga } from "@/lib/pcp/fechas";

interface PayloadCierre {
  ausentes: number[];
  pctBachas: { idPartida: number; pct: number }[];
  stockReal: Record<string, number>;
  bachasOverride: Record<string, number>;
  cocinarOverride: Record<string, number>;
}

function numerarClaves(registro: Record<string, number> | undefined): Record<number, number> {
  const salida: Record<number, number> = {};
  for (const [clave, valor] of Object.entries(registro ?? {})) salida[Number(clave)] = valor;
  return salida;
}

export async function confirmarCierreAction(
  _prevState: { error?: string; ok?: boolean; opsFabricacion?: number; opsCoccion?: number } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  let payload: PayloadCierre;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Los datos del cierre no son válidos." };
  }

  try {
    const r = await confirmarCierre({
      fecha: fechaEnMalaga(),
      fechaPlan: mananaEnMalaga(),
      userCierre: user.idUser,
      ausentes: payload.ausentes ?? [],
      pctBachas: payload.pctBachas ?? [],
      stockReal: numerarClaves(payload.stockReal),
      bachasOverride: numerarClaves(payload.bachasOverride),
      cocinarOverride: numerarClaves(payload.cocinarOverride),
    });
    revalidatePath("/pcp");
    revalidatePath("/ordenes");
    revalidatePath("/exhibir");
    return { ok: true, opsFabricacion: r.opsFabricacion.length, opsCoccion: r.opsCoccion.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo confirmar el cierre." };
  }
}

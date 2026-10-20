"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { setDemandaBase, updateConfigPcp } from "@/lib/pcp/cierre-queries";

// Tope superior para no desbordar las columnas NUMERIC con una cifra tipeada de más.
const TOPE = 1e8;

export async function actualizarConfigPcpAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const margenPct = Number(formData.get("margenPct"));
  const diasCobertura = Number(formData.get("diasCobertura"));
  if (!Number.isFinite(margenPct) || margenPct < 0 || margenPct > TOPE) return;
  if (!Number.isFinite(diasCobertura) || diasCobertura < 0 || diasCobertura > TOPE) return;

  await updateConfigPcp(margenPct, diasCobertura);
  revalidatePath("/pcp");
}

export async function actualizarDemandaBaseAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const idProd = Number(formData.get("idProd"));
  const kgDia = Number(formData.get("kgDia"));
  if (!idProd || !Number.isFinite(kgDia) || kgDia < 0 || kgDia > TOPE) return;

  await setDemandaBase(idProd, kgDia);
  revalidatePath("/pcp");
}

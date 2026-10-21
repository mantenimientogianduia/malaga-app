"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { setPctDias, setPctSabores, updateConfigPcp } from "@/lib/pcp/cierre-queries";

const TOPE = 1e8;
const MAX_DIAS_COBERTURA = 60;

export async function actualizarConfigPcpAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const margenPct = Number(formData.get("margenPct"));
  const diasCobertura = Number(formData.get("diasCobertura"));
  const demandaSemanalKg = Number(formData.get("demandaSemanalKg"));
  const valido = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  if (!valido(margenPct, TOPE) || !valido(diasCobertura, MAX_DIAS_COBERTURA) || !valido(demandaSemanalKg, TOPE)) {
    return;
  }

  await updateConfigPcp(margenPct, diasCobertura, demandaSemanalKg);
  revalidatePath("/pcp");
}

// Lee los campos `pct_<id>` del formulario. Devuelve null si alguno no es un % válido.
function leerPcts(formData: FormData): { id: number; pct: number }[] | null {
  const items: { id: number; pct: number }[] = [];
  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith("pct_")) continue;
    const id = Number(clave.slice(4));
    const pct = Number(valor);
    if (!Number.isInteger(id) || id <= 0 || String(valor).trim() === "" || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      return null;
    }
    items.push({ id, pct });
  }
  return items;
}

// Los 7 días llegan como pct_1 ... pct_7 (1 = lunes).
export async function actualizarPctDiaAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const items = leerPcts(formData);
  if (!items || items.length !== 7) return;
  const pcts = new Array<number>(7).fill(0);
  for (const { id, pct } of items) {
    if (id < 1 || id > 7) return;
    pcts[id - 1] = pct;
  }

  await setPctDias(pcts);
  revalidatePath("/pcp");
}

// Los sabores llegan como pct_<idProd>.
export async function actualizarPctSaborAction(formData: FormData) {
  await requireRole(["gestion", "admin"]);
  const items = leerPcts(formData);
  if (!items || items.length === 0) return;

  await setPctSabores(items.map((i) => ({ idProd: i.id, pct: i.pct })));
  revalidatePath("/pcp");
}

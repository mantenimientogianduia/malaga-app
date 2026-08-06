"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { generarPlanManana, type FilaConfirmada } from "@/lib/pcp/queries";

function manana(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function generarPlanAction(
  _prevState: { error?: string; ok?: boolean; cantidadOps?: number } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin"]);

  const idsProd = formData.getAll("idProd").map(Number);
  const tipos = formData.getAll("tipoProducto") as ("PT" | "SEMI")[];
  const cantidades = formData.getAll("cantidadAPlanificar").map(Number);
  const demandas = formData.getAll("demandaPronosticada").map(Number);
  const stocks = formData.getAll("stockActual").map(Number);
  const minimos = formData.getAll("stockMinimo").map(Number);
  const pendientes = formData.getAll("coccionesPendientes").map(Number);
  const necesarios = formData.getAll("necesario").map(Number);
  const factorPuntualRaw = String(formData.get("factorPuntualSemana") ?? "").trim();
  const factorPuntualSemana = factorPuntualRaw ? Number(factorPuntualRaw) : null;

  if (idsProd.length === 0) {
    return { error: "No hay filas para generar." };
  }

  const filas: FilaConfirmada[] = idsProd.map((idProd, i) => ({
    idProd,
    tipoProducto: tipos[i],
    cantidadAPlanificar: cantidades[i],
    demandaPronosticada: demandas[i],
    stockActual: stocks[i],
    stockMinimo: minimos[i],
    coccionesPendientes: pendientes[i],
    necesario: necesarios[i],
  }));

  try {
    const { idsOp } = await generarPlanManana(filas, manana(), factorPuntualSemana, user.idUser);
    revalidatePath("/ordenes");
    revalidatePath("/pcp");
    return { ok: true, cantidadOps: idsOp.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo generar el plan." };
  }
}

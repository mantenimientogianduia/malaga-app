"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { updateProducto } from "@/lib/productos/queries";

export async function actualizarProductoAction(
  _prevState: { error?: string; ok?: boolean } | undefined,
  formData: FormData
) {
  await requireRole(["gestion", "admin"]);

  const idProd = Number(formData.get("idProd"));
  const codigo = String(formData.get("codigo") ?? "").trim() || undefined;
  const detalle = String(formData.get("detalle") ?? "").trim();
  const unidMed = String(formData.get("unidMed") ?? "").trim();
  const sector = String(formData.get("sector") ?? "").trim() || undefined;
  const familia = String(formData.get("familia") ?? "").trim() || undefined;
  const pesoEstandarRaw = String(formData.get("pesoEstandar") ?? "").trim();
  const stockMinimoRaw = String(formData.get("stockMinimo") ?? "").trim();
  const loteOptimoRaw = String(formData.get("loteOptimo") ?? "").trim();
  const loteMinimoRaw = String(formData.get("loteMinimo") ?? "").trim();
  const activo = formData.get("activo") === "on";

  if (!idProd || !detalle || !unidMed || !stockMinimoRaw) {
    return { error: "Completá detalle, unidad de medida y stock mínimo." };
  }

  const pesoEstandar = pesoEstandarRaw ? Number(pesoEstandarRaw) : undefined;
  const stockMinimo = Number(stockMinimoRaw);
  const loteOptimo = loteOptimoRaw ? Number(loteOptimoRaw) : undefined;
  const loteMinimo = loteMinimoRaw ? Number(loteMinimoRaw) : undefined;

  try {
    await updateProducto(idProd, {
      codigo,
      detalle,
      unidMed,
      sector,
      familia,
      pesoEstandar,
      activo,
      stockMinimo,
      loteOptimo,
      loteMinimo,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar el producto." };
  }

  revalidatePath(`/productos/${idProd}`);
  revalidatePath("/productos");
  return { ok: true };
}

"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { createProducto } from "@/lib/productos/queries";

export async function crearProducto(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  await requireRole(["gestion", "admin"]);

  const detalle = String(formData.get("detalle") ?? "").trim();
  const unidMed = String(formData.get("unidMed") ?? "").trim();
  const tipoProducto = String(formData.get("tipoProducto") ?? "");
  const sector = String(formData.get("sector") ?? "").trim() || undefined;
  const familia = String(formData.get("familia") ?? "").trim() || undefined;
  const pesoEstandarRaw = String(formData.get("pesoEstandar") ?? "").trim();

  if (!detalle || !unidMed || (tipoProducto !== "PT" && tipoProducto !== "SEMI")) {
    return { error: "Completá detalle, unidad de medida y tipo de producto." };
  }

  const pesoEstandar = pesoEstandarRaw ? Number(pesoEstandarRaw) : undefined;

  try {
    await createProducto({
      detalle,
      unidMed,
      tipoProducto: tipoProducto as "PT" | "SEMI",
      sector,
      familia,
      pesoEstandar,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear el producto." };
  }

  redirect("/productos");
}

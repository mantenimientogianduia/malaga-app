"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import { createReceta } from "@/lib/recetas/queries";

export async function crearRecetaAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireRole(["gestion", "admin"]);

  const idProd = Number(formData.get("idProd"));
  const idsSubprod = formData.getAll("idSubprod").map(Number);
  const cantidades = formData.getAll("cantSubprod").map(Number);

  if (!idProd || idsSubprod.length === 0) {
    return { error: "Elegí un producto y al menos un ingrediente." };
  }

  const items = idsSubprod.map((idSubprod, i) => ({ idSubprod, cantSubprod: cantidades[i] }));

  if (items.some((item) => !item.idSubprod || !item.cantSubprod || item.cantSubprod <= 0)) {
    return { error: "Todos los ingredientes necesitan producto y cantidad mayor a cero." };
  }

  try {
    await createReceta({ idProd, items, userAlta: user.idUser });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear la receta." };
  }

  redirect("/recetas");
}

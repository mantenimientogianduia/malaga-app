"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { crearOrdenAction } from "./actions";
import type { ProductoConReceta } from "@/lib/ordenes/queries";

export function NuevaOrdenForm({ productos }: { productos: ProductoConReceta[] }) {
  const [state, formAction, pending] = useActionState(crearOrdenAction, undefined);
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);

  const idProdInicial = searchParams.get("idProd") ?? "";
  const productoInicial = productos.find((p) => String(p.idProd) === idProdInicial);

  const [idProdSeleccionado, setIdProdSeleccionado] = useState(productoInicial ? idProdInicial : "");
  const [cantPlan, setCantPlan] = useState(productoInicial?.pesoEstandar ?? "");

  function handleProductoChange(idProd: string) {
    setIdProdSeleccionado(idProd);
    const producto = productos.find((p) => String(p.idProd) === idProd);
    if (producto?.pesoEstandar) {
      setCantPlan(producto.pesoEstandar);
    }
  }

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Producto
        <select
          name="idProd"
          required
          value={idProdSeleccionado}
          onChange={(e) => handleProductoChange(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <option value="">Elegí un producto...</option>
          {productos.map((p) => (
            <option key={p.idProd} value={p.idProd}>
              {p.detalle} ({p.tipoProducto})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Cantidad planificada
        <input
          name="cantPlan"
          type="number"
          step="0.001"
          required
          value={cantPlan}
          onChange={(e) => setCantPlan(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Fecha planificada
        <input
          name="fechaPlan"
          type="date"
          required
          defaultValue={today}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        />
      </label>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Crear OP"}
      </button>
    </form>
  );
}

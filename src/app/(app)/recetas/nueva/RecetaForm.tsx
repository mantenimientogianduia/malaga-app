"use client";

import { useActionState, useState } from "react";
import { crearRecetaAction } from "./actions";
import type { Producto } from "@/lib/productos/queries";

export function RecetaForm({ productos }: { productos: Producto[] }) {
  const [state, formAction, pending] = useActionState(crearRecetaAction, undefined);
  const [rows, setRows] = useState([0]);

  const productosPT = productos.filter((p) => p.tipoProducto === "PT");

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Producto a fabricar
        <select name="idProd" required className="rounded-md border border-border bg-surface-raised px-3 py-2">
          <option value="">Elegí un producto...</option>
          {productosPT.map((p) => (
            <option key={p.idProd} value={p.idProd}>
              {p.detalle}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-ink">Ingredientes</span>
        {rows.map((rowId) => (
          <div key={rowId} className="flex gap-2">
            <select
              name="idSubprod"
              required
              className="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2"
            >
              <option value="">Elegí un ingrediente...</option>
              {productos.map((p) => (
                <option key={p.idProd} value={p.idProd}>
                  {p.detalle} ({p.tipoProducto})
                </option>
              ))}
            </select>
            <input
              name="cantSubprod"
              type="number"
              step="0.001"
              required
              placeholder="Cantidad"
              className="w-28 rounded-md border border-border bg-surface-raised px-3 py-2"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((r) => [...r, r.length])}
          className="self-start text-sm font-medium text-copper hover:text-copper-strong"
        >
          + Agregar ingrediente
        </button>
      </div>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Crear receta"}
      </button>
    </form>
  );
}

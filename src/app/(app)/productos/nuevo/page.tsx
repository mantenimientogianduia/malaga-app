"use client";

import { useActionState, useState } from "react";
import { crearProducto } from "./actions";

export default function NuevoProductoPage() {
  const [state, formAction, pending] = useActionState(crearProducto, undefined);
  const [tipoProducto, setTipoProducto] = useState("PT");

  return (
    <div className="p-10">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Nuevo producto</h1>

      <form action={formAction} className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Detalle
          <input
            name="detalle"
            required
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Tipo de producto
          <select
            name="tipoProducto"
            value={tipoProducto}
            onChange={(e) => setTipoProducto(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          >
            <option value="PT">PT (producto terminado)</option>
            <option value="SEMI">SEMI (semielaborado)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Unidad de medida
          <input
            name="unidMed"
            required
            placeholder="kg"
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>

        {tipoProducto === "PT" && (
          <label className="flex flex-col gap-1 text-sm text-ink">
            Peso estándar de bacha
            <input
              name="pesoEstandar"
              type="number"
              step="0.001"
              required
              className="rounded-md border border-border bg-surface-raised px-3 py-2"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm text-ink">
          Sector (opcional)
          <input name="sector" className="rounded-md border border-border bg-surface-raised px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Familia (opcional)
          <input name="familia" className="rounded-md border border-border bg-surface-raised px-3 py-2" />
        </label>

        {state?.error && <p className="text-sm text-bad">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Crear producto"}
        </button>
      </form>
    </div>
  );
}

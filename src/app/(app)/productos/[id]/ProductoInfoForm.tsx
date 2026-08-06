"use client";

import { useActionState } from "react";
import { actualizarProductoAction } from "./actions";
import type { Producto } from "@/lib/productos/queries";

export function ProductoInfoForm({ producto }: { producto: Producto }) {
  const [state, formAction, pending] = useActionState(actualizarProductoAction, undefined);

  return (
    <form action={formAction} className="card-raised flex flex-col gap-4 p-6">
      <input type="hidden" name="idProd" value={producto.idProd} />

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Código
          <input
            name="codigo"
            defaultValue={producto.codigo ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-copper focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Unidad de medida
          <input
            name="unidMed"
            required
            defaultValue={producto.unidMed}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Detalle
        <input
          name="detalle"
          required
          defaultValue={producto.detalle}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Sector
          <input
            name="sector"
            defaultValue={producto.sector ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Familia
          <input
            name="familia"
            defaultValue={producto.familia ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
      </div>

      {producto.tipoProducto === "PT" && (
        <label className="flex flex-col gap-1 text-sm text-ink">
          Peso estándar de bacha
          <input
            name="pesoEstandar"
            type="number"
            step="0.001"
            required
            defaultValue={producto.pesoEstandar ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
      )}

      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Stock mínimo de seguridad
          <input
            name="stockMinimo"
            type="number"
            step="0.001"
            required
            defaultValue={producto.stockMinimo}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Lote óptimo (vacío = libre)
          <input
            name="loteOptimo"
            type="number"
            step="0.001"
            defaultValue={producto.loteOptimo ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Lote mínimo (vacío = libre)
          <input
            name="loteMinimo"
            type="number"
            step="0.001"
            defaultValue={producto.loteMinimo ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="activo"
          defaultChecked={producto.activo}
          className="h-4 w-4 rounded border-border accent-[var(--copper)]"
        />
        Producto activo
      </label>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-copper px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar cambios"}
        </button>
        {state?.ok && <span className="text-xs font-medium text-ok">Guardado.</span>}
        {state?.error && <span className="text-xs font-medium text-bad">{state.error}</span>}
      </div>
    </form>
  );
}

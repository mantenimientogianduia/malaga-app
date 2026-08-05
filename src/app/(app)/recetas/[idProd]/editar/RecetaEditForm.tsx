"use client";

import { useActionState, useState } from "react";
import { crearRecetaAction } from "../../nueva/actions";
import type { Producto } from "@/lib/productos/queries";
import type { RecetaConDetalle } from "@/lib/recetas/queries";

interface Row {
  key: number;
  idSubprod: string;
  cantSubprod: string;
}

export function RecetaEditForm({
  idProd,
  productos,
  recetaActual,
}: {
  idProd: number;
  productos: Producto[];
  recetaActual: RecetaConDetalle | null;
}) {
  const [state, formAction, pending] = useActionState(crearRecetaAction, undefined);
  const [rows, setRows] = useState<Row[]>(
    recetaActual && recetaActual.items.length > 0
      ? recetaActual.items.map((item, i) => ({
          key: i,
          idSubprod: String(item.idSubprod),
          cantSubprod: item.cantSubprod,
        }))
      : [{ key: 0, idSubprod: "", cantSubprod: "" }]
  );

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <form action={formAction} className="card-raised flex max-w-lg flex-col gap-4 p-6">
      <input type="hidden" name="idProd" value={idProd} />

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-ink">Ingredientes</span>
        {rows.map((row) => (
          <div key={row.key} className="flex gap-2">
            <select
              name="idSubprod"
              required
              value={row.idSubprod}
              onChange={(e) => updateRow(row.key, { idSubprod: e.target.value })}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
            >
              <option value="">Elegí un ingrediente...</option>
              {productos
                .filter((p) => p.idProd !== idProd)
                .map((p) => (
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
              value={row.cantSubprod}
              onChange={(e) => updateRow(row.key, { cantSubprod: e.target.value })}
              className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-copper focus:outline-none"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { key: Date.now(), idSubprod: "", cantSubprod: "" }])}
          className="self-start text-sm font-medium text-copper hover:text-copper-strong"
        >
          + Agregar ingrediente
        </button>
      </div>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-copper px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
        >
          {pending ? "Guardando..." : recetaActual ? `Guardar como v${recetaActual.version + 1}` : "Crear receta"}
        </button>
        {recetaActual && (
          <span className="text-xs text-ink-soft">La versión v{recetaActual.version} actual queda archivada.</span>
        )}
      </div>
    </form>
  );
}

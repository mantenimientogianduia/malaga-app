"use client";

import { useActionState } from "react";
import { finalizarOrdenAction } from "./actions";
import type { OrdenParaFinalizar } from "@/lib/ordenes/queries";

export function FinalizarForm({ orden }: { orden: OrdenParaFinalizar }) {
  const [state, formAction, pending] = useActionState(finalizarOrdenAction, undefined);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="idOp" value={orden.idOp} />

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Cantidad real producida
          <input
            name="cantReal"
            type="number"
            step="0.001"
            required
            defaultValue={orden.cantPlan}
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Fecha de fabricación
          <input
            name="fechaFab"
            type="date"
            required
            defaultValue={today}
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Lote de la partida generada
        <input
          name="lote"
          required
          placeholder={`${orden.productoDetalle}-${today}`}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        />
      </label>

      {orden.items.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-ink">Consumo de ingredientes</span>
          {orden.items.map((item) => (
            <div key={item.idDetalleReceta} className="rounded-md border border-border p-3">
              <input type="hidden" name="idDetalleReceta" value={item.idDetalleReceta} />
              <input type="hidden" name="idSubprod" value={item.idSubprod} />
              <div className="mb-2 text-sm font-medium text-ink">
                {item.subprodDetalle}{" "}
                <span className="font-mono text-xs text-ink-soft">
                  (sugerido: {item.cantSugerida})
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  name="idPartidaSubprod"
                  required
                  className="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                >
                  <option value="">Elegí un lote...</option>
                  {item.partidasDisponibles.map((p) => (
                    <option key={p.idPartida} value={p.idPartida}>
                      {p.lote} (restante: {p.restante})
                    </option>
                  ))}
                </select>
                <input
                  name="cantConsumo"
                  type="number"
                  step="0.001"
                  required
                  defaultValue={item.cantSugerida}
                  className="w-28 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                />
              </div>
              {item.partidasDisponibles.length === 0 && (
                <p className="mt-2 text-xs text-warn">
                  No hay partidas con stock vivo de este ingrediente todavía.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Finalizando..." : "Finalizar OP"}
      </button>
    </form>
  );
}

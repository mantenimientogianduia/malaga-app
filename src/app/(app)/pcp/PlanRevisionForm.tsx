"use client";

import { useActionState, useState } from "react";
import { generarPlanAction } from "./actions";
import type { FilaPlan } from "@/lib/pcp/queries";

function FilaEditable({ fila }: { fila: FilaPlan }) {
  const [cantidad, setCantidad] = useState(fila.cantidadAPlanificar);

  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
      <td className="px-3.5 py-2.5 font-medium text-ink">{fila.productoDetalle}</td>
      <td className="px-3.5 py-2.5 text-ink-soft">{fila.tipoProducto}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.demandaPronosticada.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.stockActual.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.stockMinimo.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.coccionesPendientes.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">{fila.necesario.toFixed(3)}</td>
      <td className="px-3.5 py-2.5 text-right">
        <input type="hidden" name="idProd" value={fila.idProd} />
        <input type="hidden" name="tipoProducto" value={fila.tipoProducto} />
        <input type="hidden" name="demandaPronosticada" value={fila.demandaPronosticada} />
        <input type="hidden" name="stockActual" value={fila.stockActual} />
        <input type="hidden" name="stockMinimo" value={fila.stockMinimo} />
        <input type="hidden" name="coccionesPendientes" value={fila.coccionesPendientes} />
        <input type="hidden" name="necesario" value={fila.necesario} />
        <input
          name="cantidadAPlanificar"
          type="number"
          step="0.001"
          value={cantidad}
          onChange={(e) => setCantidad(Number(e.target.value))}
          className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
        />
      </td>
    </tr>
  );
}

export function PlanRevisionForm({ filas, factor }: { filas: FilaPlan[]; factor: number }) {
  const [state, formAction, pending] = useActionState(generarPlanAction, undefined);
  const pt = filas.filter((f) => f.tipoProducto === "PT");
  const semi = filas.filter((f) => f.tipoProducto === "SEMI");

  if (state?.ok) {
    return (
      <div className="card p-5 text-sm text-ink">
        Plan generado: {state.cantidadOps} OP{state.cantidadOps === 1 ? "" : "s"} creada
        {state.cantidadOps === 1 ? "" : "s"} para mañana. Se ven y gestionan desde{" "}
        <a href="/ordenes" className="font-semibold text-copper hover:text-copper-strong">
          Órdenes
        </a>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action="/pcp" method="GET" className="flex items-end gap-2">
        <label className="flex max-w-xs flex-col gap-1 text-xs text-ink">
          Factor puntual de esta semana (1 = sin ajuste)
          <input
            name="factor"
            type="number"
            step="0.01"
            defaultValue={factor}
            className="rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-copper hover:text-copper"
        >
          Recalcular
        </button>
      </form>

      <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="factorPuntualSemana" value={factor} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
              <th className="px-3.5 py-2.5">Producto</th>
              <th className="px-3.5 py-2.5">Tipo</th>
              <th className="px-3.5 py-2.5 text-right">Demanda pronosticada</th>
              <th className="px-3.5 py-2.5 text-right">Stock actual</th>
              <th className="px-3.5 py-2.5 text-right">Stock mínimo</th>
              <th className="px-3.5 py-2.5 text-right">Pendientes</th>
              <th className="px-3.5 py-2.5 text-right">Necesario</th>
              <th className="px-3.5 py-2.5 text-right">A planificar</th>
            </tr>
          </thead>
          <tbody>
            {pt.map((fila) => (
              <FilaEditable key={fila.idProd} fila={fila} />
            ))}
            {semi.map((fila) => (
              <FilaEditable key={fila.idProd} fila={fila} />
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3.5 py-8 text-center text-ink-soft">
                  No hay sabores en la cartilla todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || filas.length === 0}
        className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
      >
        {pending ? "Generando..." : "Generar plan de mañana"}
      </button>
      </form>
    </div>
  );
}

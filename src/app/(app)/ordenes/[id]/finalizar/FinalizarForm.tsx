"use client";

import { useActionState, useState } from "react";
import { finalizarOrdenAction } from "./actions";
import type { OrdenParaFinalizar } from "@/lib/ordenes/queries";

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convierte el datetime-local (tal como lo lee el reloj del dispositivo) a un
// instante ISO real usando el propio huso horario del navegador, sin asumir
// ninguna zona horaria fija del lado del servidor.
function toIso(local: string): string {
  return local ? new Date(local).toISOString() : "";
}

export function FinalizarForm({ orden }: { orden: OrdenParaFinalizar }) {
  const [state, formAction, pending] = useActionState(finalizarOrdenAction, undefined);
  const [tsIniLocal, setTsIniLocal] = useState(orden.tsIni ? toLocal(orden.tsIni) : nowLocal());
  const [tsFinLocal, setTsFinLocal] = useState(nowLocal());

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="idOp" value={orden.idOp} />
      <input type="hidden" name="tsIni" value={toIso(tsIniLocal)} />
      <input type="hidden" name="tsFin" value={toIso(tsFinLocal)} />
      <input type="hidden" name="tsFinLocal" value={tsFinLocal} />

      <div className="grid grid-cols-3 gap-4">
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
          Hora de inicio
          <input
            type="datetime-local"
            required
            value={tsIniLocal}
            onChange={(e) => setTsIniLocal(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Hora de fin
          <input
            type="datetime-local"
            required
            value={tsFinLocal}
            onChange={(e) => setTsFinLocal(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>
      </div>

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
                  className="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                >
                  <option value="">Sin lote elegido</option>
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
                  No hay partidas con stock vivo de este ingrediente todavía — se va a registrar el consumo
                  sin lote asociado.
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

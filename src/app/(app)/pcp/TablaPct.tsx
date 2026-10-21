"use client";

import { useState } from "react";
import { sumaPct } from "@/lib/pcp/demanda";

export interface FilaPct {
  id: number;
  etiqueta: string;
  pct: number;
}

export function TablaPct({
  filas,
  action,
  vacio,
}: {
  filas: FilaPct[];
  action: (formData: FormData) => void | Promise<void>;
  vacio?: string;
}) {
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(filas.map((f) => [f.id, String(f.pct)]))
  );

  const suma = sumaPct(filas.map((f) => Number(valores[f.id]) || 0));
  const suma100 = Math.abs(suma - 100) < 0.005;

  if (filas.length === 0) {
    return <p className="card p-4 text-sm text-ink-soft">{vacio ?? "No hay filas."}</p>;
  }

  return (
    <form action={action} className="card flex flex-col gap-2 p-4">
      <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
        {filas.map((f) => (
          <label key={f.id} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span className="truncate">{f.etiqueta}</span>
            <span className="flex flex-none items-center gap-1">
              <input
                name={`pct_${f.id}`}
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={valores[f.id] ?? ""}
                onChange={(e) => setValores({ ...valores, [f.id]: e.target.value })}
                className="w-20 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-base sm:text-sm"
              />
              <span className="text-xs text-ink-soft">%</span>
            </span>
          </label>
        ))}
      </div>

      <div
        role="status"
        className={`rounded-lg px-3 py-2 text-xs font-semibold ${suma100 ? "bg-ok-tint text-ok" : "bg-warn-tint text-warn"}`}
      >
        Suma: {suma.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %
        {suma100 ? "" : " — no suma 100 %, revisá los valores"}
      </div>

      <button
        type="submit"
        className="self-start rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
      >
        Guardar
      </button>
    </form>
  );
}

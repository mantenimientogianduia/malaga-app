"use client";

import { useActionState } from "react";
import { actualizarConfigTemperaturasAction } from "./actions";

export function ConfigTemperaturasForm({ tempMin, tempMax }: { tempMin: string; tempMax: string }) {
  const [state, formAction, pending] = useActionState(actualizarConfigTemperaturasAction, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-ink">
        Mínimo (°C)
        <input
          name="tempMin"
          type="number"
          step="0.1"
          required
          defaultValue={tempMin}
          className="w-24 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink">
        Máximo (°C)
        <input
          name="tempMax"
          type="number"
          step="0.1"
          required
          defaultValue={tempMax}
          className="w-24 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-copper hover:text-copper disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar rango"}
      </button>
      {state?.error && <p className="w-full text-xs text-bad">{state.error}</p>}
    </form>
  );
}

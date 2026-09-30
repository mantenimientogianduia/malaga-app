"use client";

import { useActionState, useState } from "react";
import { crearQuiebreAction } from "./actions";
import type { SaborParaQuiebre } from "@/lib/quiebres/queries";

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QuiebreForm({ sabores }: { sabores: SaborParaQuiebre[] }) {
  const [state, formAction, pending] = useActionState(crearQuiebreAction, undefined);
  const [idProd, setIdProd] = useState("");
  const [tsLocal, setTsLocal] = useState(nowLocal());

  const seleccionado = sabores.find((s) => String(s.idProd) === idProd);
  const tieneStockEsperando = !!seleccionado?.tieneBachasPendientes;

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="tsQuiebreReal" value={tsLocal ? new Date(tsLocal).toISOString() : ""} />

      <label className="flex flex-col gap-1 text-sm text-ink">
        Sabor
        <select
          name="idProd"
          required
          value={idProd}
          onChange={(e) => setIdProd(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <option value="">Elegí un sabor...</option>
          {sabores.map((s) => (
            <option key={s.idProd} value={s.idProd}>
              {s.detalle}
              {s.tieneBachasPendientes ? " (tiene bachas esperando)" : ""}
            </option>
          ))}
        </select>
      </label>

      {tieneStockEsperando && (
        <p className="rounded-lg bg-warn-tint px-3 py-2 text-xs font-medium text-warn">
          Este sabor todavía tiene bachas esperando para exhibir. ¿Seguro que es un quiebre?
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-ink">
        Fecha y hora real del quiebre
        <input
          type="datetime-local"
          required
          value={tsLocal}
          onChange={(e) => setTsLocal(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        />
      </label>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.success && <p className="text-sm text-ok">Quiebre registrado.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Registrar quiebre"}
      </button>
    </form>
  );
}

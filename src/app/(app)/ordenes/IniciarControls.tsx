"use client";

import { useState } from "react";
import { iniciarRapidoAction, iniciarConHorarioAction } from "./actions";

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function IniciarControls({ idOp }: { idOp: number }) {
  const [editing, setEditing] = useState(false);
  const [horarioLocal, setHorarioLocal] = useState(nowLocal());

  if (editing) {
    return (
      <form action={iniciarConHorarioAction} className="flex items-center gap-1">
        <input type="hidden" name="idOp" value={idOp} />
        <input type="hidden" name="horario" value={horarioLocal ? new Date(horarioLocal).toISOString() : ""} />
        <input
          type="datetime-local"
          required
          value={horarioLocal}
          onChange={(e) => setHorarioLocal(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-1.5 py-1 text-[10.5px]"
        />
        <button
          type="submit"
          className="whitespace-nowrap rounded-md bg-copper px-2 py-1 text-[10.5px] font-semibold text-white"
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="px-1 text-[10.5px] text-ink-soft hover:text-ink"
        >
          ✕
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <form action={iniciarRapidoAction}>
        <input type="hidden" name="idOp" value={idOp} />
        <button
          type="submit"
          className="whitespace-nowrap rounded-md bg-copper px-2.5 py-1 text-[10.5px] font-semibold text-white transition-colors hover:bg-copper-strong"
        >
          Iniciar
        </button>
      </form>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="whitespace-nowrap text-[10.5px] font-medium text-ink-soft underline decoration-dotted hover:text-copper"
      >
        con horario
      </button>
    </div>
  );
}

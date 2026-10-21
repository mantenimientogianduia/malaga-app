"use client";

import { startTransition, useActionState, useState } from "react";
import { darDeBajaBachaAction } from "./actions";

export function BajaBacha({ idPartida, descripcion }: { idPartida: number; descripcion: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [observacion, setObservacion] = useState("");
  const [state, formAction, pending] = useActionState(darDeBajaBachaAction, undefined);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="self-start text-xs font-medium text-ink-soft transition-colors hover:text-bad"
      >
        Dar de baja
      </button>
    );
  }

  const completo = motivo !== "" && observacion.trim() !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !completo) return;
        const datos = new FormData(e.currentTarget);
        startTransition(() => formAction(datos));
      }}
      className="flex flex-col gap-2 rounded-lg border border-border p-2.5"
    >
      <input type="hidden" name="idPartida" value={idPartida} />
      <p className="text-[11px] font-medium text-ink">Dar de baja la bacha de {descripcion}</p>

      <select
        name="motivo"
        required
        aria-label="Motivo de la baja"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-base text-ink sm:text-xs"
      >
        <option value="">Motivo...</option>
        <option value="scrap">Scrap (descarte)</option>
        <option value="vencido">Vencido</option>
        <option value="ajuste">Ajuste de stock</option>
      </select>

      <textarea
        name="observacion"
        required
        rows={2}
        aria-label="Observación de la baja"
        placeholder="¿Qué pasó con la bacha?"
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
        className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-base text-ink sm:text-xs"
      />

      {state?.error && (
        <p role="alert" className="rounded-lg bg-bad-tint px-2.5 py-1.5 text-[11px] font-medium text-bad">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !completo}
          className="rounded-lg bg-bad px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Confirmar baja"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs font-medium text-ink-soft hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

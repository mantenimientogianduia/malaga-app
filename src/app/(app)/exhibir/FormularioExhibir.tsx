"use client";

import { startTransition, useActionState, useState } from "react";
import { exhibirPartidaAction } from "./actions";
import { FechaHoraExhibicion } from "./FechaHoraExhibicion";

export function FormularioExhibir({
  idPartida,
  idExhibidora,
  textoBoton,
  checkboxUltimaBacha,
}: {
  idPartida: number;
  idExhibidora: number;
  textoBoton: string;
  checkboxUltimaBacha?: { label: string; hint: boolean };
}) {
  const [state, formAction, pending] = useActionState(exhibirPartidaAction, undefined);
  const [marcarUltima, setMarcarUltima] = useState(false);
  // Resultado cuyo error el usuario ya "descartó" al tocar un campo; un resultado nuevo es otro objeto y vuelve a mostrarse.
  const [descartado, setDescartado] = useState(state);
  const errorVisible = state?.error && state !== descartado ? state.error : null;

  return (
    <form
      onChange={() => setDescartado(state)}
      onSubmit={(e) => {
        // Sin <form action>: React 19 resetearía los campos al terminar, también con error.
        e.preventDefault();
        if (pending) return;
        const datos = new FormData(e.currentTarget);
        startTransition(() => formAction(datos));
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="idPartida" value={idPartida} />
      <input type="hidden" name="idExhibidora" value={idExhibidora} />

      {checkboxUltimaBacha && (
        <label className="flex items-start gap-2 text-[11px] text-ink-soft">
          <input
            type="checkbox"
            name="oficializarCambioAhora"
            checked={marcarUltima}
            onChange={(e) => setMarcarUltima(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {checkboxUltimaBacha.label}
            {checkboxUltimaBacha.hint && (
              <span className="block text-ok">No quedan más bachas pendientes de este sabor.</span>
            )}
          </span>
        </label>
      )}

      <FechaHoraExhibicion />

      {errorVisible && (
        <p role="alert" className="rounded-lg bg-bad-tint px-2.5 py-1.5 text-[11px] font-medium text-bad">
          {errorVisible}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
      >
        {pending ? "Exhibiendo..." : textoBoton}
      </button>
    </form>
  );
}

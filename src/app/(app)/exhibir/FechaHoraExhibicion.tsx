"use client";

import { useState } from "react";

// YYYY-MM-DDTHH:mm en hora local del dispositivo (formato de <input type="datetime-local">).
function aInputLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Por defecto la bacha se exhibe "ahora" (el servidor usa su reloj). Solo si el usuario toca "Cambiar"
// se abre el campo ya cargado con la hora actual del dispositivo, y se envía el instante elegido (ISO).
// El campo no existe hasta que se pide, así no hay diferencias entre el HTML del servidor y el del navegador.
export function FechaHoraExhibicion() {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");

  const fecha = editando && valor !== "" ? new Date(valor) : null;
  // Editando con un valor inválido (p. ej. año de 5 dígitos) se manda un marcador que el servidor rechaza,
  // para no exhibir con la hora actual sin avisar.
  const iso = !editando ? "" : fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : "invalida";

  return (
    <div className="flex flex-col gap-1 text-[11px] text-ink-soft">
      <input type="hidden" name="tsExhibicion" value={iso} />
      {editando ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Fecha y hora</span>
          <input
            type="datetime-local"
            required
            autoFocus
            aria-label="Fecha y hora de la exhibición"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 text-base text-ink sm:text-xs"
          />
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              setValor("");
            }}
            className="px-1 py-2 font-medium text-copper hover:text-copper-strong"
          >
            Usar ahora
          </button>
        </div>
      ) : (
        <p>
          Fecha y hora: ahora ·{" "}
          <button
            type="button"
            onClick={() => {
              setValor(aInputLocal(new Date()));
              setEditando(true);
            }}
            className="px-1 py-2 font-medium text-copper hover:text-copper-strong"
          >
            Cambiar
          </button>
        </p>
      )}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { cerrarDiaTemperaturasAction, reabrirDiaTemperaturasAction } from "./actions";
import { formatFechaHora } from "@/lib/formatDate";
import type { CierreTemperaturas } from "@/lib/temperaturas/queries";

export function CierreDiaControls({
  cierre,
  puedeReabrir,
  completos,
  total,
}: {
  cierre: CierreTemperaturas | null;
  puedeReabrir: boolean;
  completos: number;
  total: number;
}) {
  const [cerrarState, cerrarAction, cerrarPending] = useActionState(cerrarDiaTemperaturasAction, undefined);
  const [reabrirState, reabrirAction, reabrirPending] = useActionState(reabrirDiaTemperaturasAction, undefined);

  if (cierre) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ok-tint p-3 text-sm text-ok">
        <span>
          Cerrado — firmado por {cierre.userCierre} el {formatFechaHora(cierre.tsCierre)}.
        </span>
        {puedeReabrir && (
          <form action={reabrirAction}>
            <button
              type="submit"
              disabled={reabrirPending}
              className="rounded-md border border-ok px-3 py-1.5 text-xs font-semibold text-ok transition-colors hover:bg-ok hover:text-white disabled:opacity-60"
            >
              {reabrirPending ? "Reabriendo..." : "Reabrir día"}
            </button>
          </form>
        )}
        {reabrirState?.error && <p className="w-full text-xs text-bad">{reabrirState.error}</p>}
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-raised p-3 text-sm text-ink">
      <span className="text-ink-soft">
        {completos} de {total} temperaturas cargadas hoy.
      </span>
      <form action={cerrarAction}>
        <button
          type="submit"
          disabled={cerrarPending}
          className="rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
        >
          {cerrarPending ? "Cerrando..." : "Cerrar y firmar el día"}
        </button>
      </form>
      {cerrarState?.error && <p className="w-full text-xs text-bad">{cerrarState.error}</p>}
    </div>
  );
}

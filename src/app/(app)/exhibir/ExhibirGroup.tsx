"use client";

import { useState } from "react";
import { exhibirPartidaAction } from "./actions";
import { formatFecha } from "@/lib/formatDate";
import type { PartidaEnObrador } from "@/lib/exhibidora/queries";

function diasDesde(fecha: string): number {
  const ms = Date.now() - new Date(`${fecha}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function ExhibirGroup({
  productoDetalle,
  partidas,
}: {
  productoDetalle: string;
  partidas: PartidaEnObrador[];
}) {
  const sorted = [...partidas].sort((a, b) => a.fechaFab.localeCompare(b.fechaFab));
  const masVieja = sorted[0];
  const [selectedId, setSelectedId] = useState(masVieja.idPartida);

  const selected = sorted.find((p) => p.idPartida === selectedId) ?? masVieja;
  const incumpleFifo = sorted.length > 1 && selected.idPartida !== masVieja.idPartida;

  return (
    <div className="card p-4">
      <h3 className="mb-2.5 text-sm font-semibold text-ink">{productoDetalle}</h3>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sorted.map((p) => {
          const esRecomendada = p.idPartida === masVieja.idPartida && sorted.length > 1;
          const seleccionada = p.idPartida === selectedId;
          return (
            <button
              key={p.idPartida}
              type="button"
              onClick={() => setSelectedId(p.idPartida)}
              className={`flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors ${
                seleccionada
                  ? "border-copper bg-copper-tint"
                  : "border-border bg-surface-raised hover:border-copper/50"
              }`}
            >
              {esRecomendada && (
                <span className="mb-0.5 rounded-full bg-ok-tint px-1.5 py-0.5 text-[9.5px] font-semibold text-ok">
                  Recomendado · FIFO
                </span>
              )}
              <span className="font-mono text-xl font-semibold leading-none text-ink">
                {p.cantidad}
              </span>
              <span className="text-xs font-medium text-ink-soft">
                {formatFecha(p.fechaFab)} · hace {diasDesde(p.fechaFab)}d
              </span>
            </button>
          );
        })}
      </div>

      {incumpleFifo && (
        <p className="mb-2.5 rounded-lg bg-warn-tint px-2.5 py-1.5 text-[11px] font-medium text-warn">
          Hay una partida más vieja (del {formatFecha(masVieja.fechaFab)}) todavía sin exhibir. Por FIFO
          conviene sacar esa primero.
        </p>
      )}

      {selected.idExhibidoraDestino ? (
        <form action={exhibirPartidaAction}>
          <input type="hidden" name="idPartida" value={selected.idPartida} />
          <input type="hidden" name="idExhibidora" value={selected.idExhibidoraDestino} />
          <button
            type="submit"
            className="rounded-lg bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
          >
            {incumpleFifo ? "Exhibir de todos modos" : "Exhibir"}
          </button>
        </form>
      ) : (
        <span className="rounded-full bg-warn-tint px-2 py-0.5 text-[10px] font-semibold text-warn">
          Sin slot de exhibidora asignado
        </span>
      )}
    </div>
  );
}

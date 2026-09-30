"use client";

import { useState } from "react";
import { exhibirPartidaAction } from "./actions";
import { formatFecha } from "@/lib/formatDate";
import type { CartillaSlot, PartidaEnObrador } from "@/lib/exhibidora/queries";

function diasDesde(fecha: string): number {
  const ms = Date.now() - new Date(`${fecha}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function BachasDeSabor({
  partidas,
  idExhibidora,
  checkboxUltimaBacha,
}: {
  partidas: PartidaEnObrador[];
  idExhibidora: number;
  checkboxUltimaBacha?: { label: string; hint: boolean };
}) {
  const sorted = [...partidas].sort((a, b) => a.fechaFab.localeCompare(b.fechaFab));
  const masVieja = sorted[0];
  const [selectedId, setSelectedId] = useState(masVieja?.idPartida);
  const [marcarUltima, setMarcarUltima] = useState(false);

  const selected = sorted.find((p) => p.idPartida === selectedId) ?? masVieja;
  const incumpleFifo = !!selected && sorted.length > 1 && selected.idPartida !== masVieja.idPartida;

  if (sorted.length === 0 || !selected) {
    return <p className="text-xs text-ink-soft">Sin bachas pendientes de exhibir.</p>;
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {sorted.map((p) => {
          const esRecomendada = p.idPartida === masVieja.idPartida && sorted.length > 1;
          const seleccionada = p.idPartida === selectedId;
          return (
            <button
              key={p.idPartida}
              type="button"
              onClick={() => setSelectedId(p.idPartida)}
              className={`flex min-w-[108px] flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors ${
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
              <span className="font-mono text-xl font-semibold leading-none text-ink">{p.cantidad}</span>
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

      <form action={exhibirPartidaAction} className="flex flex-col gap-2">
        <input type="hidden" name="idPartida" value={selected.idPartida} />
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

        <button
          type="submit"
          className="self-start rounded-lg bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
        >
          {incumpleFifo ? "Exhibir de todos modos" : "Exhibir"}
        </button>
      </form>
    </>
  );
}

export function ExhibirSlot({
  slot,
  partidasActuales,
  partidasEntrantes,
}: {
  slot: CartillaSlot;
  partidasActuales: PartidaEnObrador[];
  partidasEntrantes: PartidaEnObrador[];
}) {
  return (
    <div className="card flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-copper-tint font-mono text-[11px] font-semibold text-copper-strong">
          {slot.nro}
        </span>
        <h3 className="text-sm font-semibold text-ink">{slot.productoDetalle}</h3>
      </div>

      <BachasDeSabor
        partidas={partidasActuales}
        idExhibidora={slot.idExhibidora}
        checkboxUltimaBacha={
          slot.idProdFut
            ? {
                label: `Marcar como última bacha antes del cambio a ${slot.productoFutDetalle}`,
                hint: partidasActuales.length <= 1,
              }
            : undefined
        }
      />

      {slot.idProdFut && partidasEntrantes.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold text-warn">Entrante: {slot.productoFutDetalle}</p>
          <BachasDeSabor partidas={partidasEntrantes} idExhibidora={slot.idExhibidora} />
        </div>
      )}
    </div>
  );
}

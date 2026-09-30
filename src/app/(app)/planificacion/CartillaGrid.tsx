"use client";

import { useState } from "react";
import type { CartillaSlot } from "@/lib/exhibidora/queries";
import type { Producto } from "@/lib/productos/queries";
import { formatFecha } from "@/lib/formatDate";
import { programarCambioAction, cancelarCambioProgramadoAction, oficializarCambioAction } from "./actions";

function nowDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CartillaGrid({
  slots,
  productosDisponibles,
}: {
  slots: CartillaSlot[];
  productosDisponibles: Producto[];
}) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const abierto = slots.find((s) => s.idExhibidora === abiertoId) ?? null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {slots.map((slot) => (
          <button
            key={slot.idExhibidora}
            type="button"
            onClick={() => setAbiertoId(slot.idExhibidora)}
            className="flex flex-col items-start gap-1 rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:border-copper/50"
          >
            <div className="flex w-full items-center justify-between">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-copper-tint font-mono text-[10px] font-semibold text-copper-strong">
                {slot.nro}
              </span>
              {slot.idProdFut && <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Cambio programado" />}
            </div>
            <span className="line-clamp-2 text-xs font-medium leading-tight text-ink">{slot.productoDetalle}</span>
          </button>
        ))}
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAbiertoId(null)}
        >
          <div className="w-full max-w-sm card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="page-eyebrow mb-1">Posición {abierto.nro}</p>
                <h2 className="text-base font-semibold text-ink">{abierto.productoDetalle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setAbiertoId(null)}
                className="text-ink-soft hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-surface-raised p-3 text-xs text-ink-soft">
              {abierto.productoAntDetalle ? (
                <>
                  Antes: <span className="font-medium text-ink">{abierto.productoAntDetalle}</span>
                  {abierto.tsUltimoCambio && <> · cambió el {formatFecha(abierto.tsUltimoCambio)}</>}
                </>
              ) : (
                "Sin cambios registrados todavía."
              )}
            </div>

            {abierto.idProdFut && (
              <div className="mb-4 flex flex-col gap-2 rounded-lg bg-warn-tint p-3 text-xs text-warn">
                <span>
                  Previsto: cambia a <span className="font-semibold">{abierto.productoFutDetalle}</span> (~
                  {formatFecha(abierto.fechaCambioProgramado)}) — se oficializa al exhibir la última bacha del
                  actual, o manualmente acá.
                </span>
                <div className="flex items-center gap-3">
                  <form action={oficializarCambioAction}>
                    <input type="hidden" name="idExhibidora" value={abierto.idExhibidora} />
                    <button type="submit" className="font-semibold underline hover:no-underline">
                      Oficializar cambio ahora
                    </button>
                  </form>
                  <form action={cancelarCambioProgramadoAction}>
                    <input type="hidden" name="idExhibidora" value={abierto.idExhibidora} />
                    <button type="submit" className="font-semibold underline hover:no-underline">
                      Cancelar
                    </button>
                  </form>
                </div>
              </div>
            )}

            <form action={programarCambioAction} className="flex flex-col gap-2">
              <input type="hidden" name="idExhibidora" value={abierto.idExhibidora} />
              <label className="flex flex-col gap-1 text-xs text-ink">
                Programar cambio a
                <select
                  name="idProdNuevo"
                  required
                  defaultValue=""
                  className="rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
                >
                  <option value="" disabled>
                    Elegí un sabor fuera de cartilla...
                  </option>
                  {productosDisponibles.map((p) => (
                    <option key={p.idProd} value={p.idProd}>
                      {p.detalle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-ink">
                Fecha prevista (orientativa — el cambio se oficializa al exhibir la última bacha)
                <input
                  name="fechaProgramada"
                  type="date"
                  required
                  defaultValue={nowDate()}
                  className="rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm"
                />
              </label>
              <button
                type="submit"
                className="mt-1 self-start rounded-md bg-copper px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-copper-strong"
              >
                Programar
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

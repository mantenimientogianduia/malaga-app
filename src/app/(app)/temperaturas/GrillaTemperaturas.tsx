"use client";

import { useActionState, useState } from "react";
import { registrarTemperaturaAction } from "./actions";
import type { PuntoConEstadoHoy } from "@/lib/temperaturas/queries";

function Celda({ punto, onTap }: { punto?: PuntoConEstadoHoy; onTap?: (idPunto: number) => void }) {
  if (!punto) {
    return <div className="h-12 rounded-md border border-border bg-surface" />;
  }
  return (
    <button
      type="button"
      onClick={() => onTap?.(punto.idPunto)}
      className={`flex h-12 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
        punto.registradoHoy
          ? punto.fueraDeRangoHoy
            ? "border-bad bg-bad-tint text-bad"
            : "border-ok bg-ok-tint text-ok"
          : "border-warn bg-warn-tint text-warn hover:border-copper"
      }`}
    >
      {punto.registradoHoy ? `${punto.temperaturaHoy}°` : "Medir"}
    </button>
  );
}

function ExhibidoraGrid({
  numero,
  puntos,
  onTap,
}: {
  numero: number;
  puntos: PuntoConEstadoHoy[];
  onTap: (idPunto: number) => void;
}) {
  const obradorIzq = puntos.find((p) => p.exhibidora === numero && p.lado === "obrador" && p.posicion === "izquierda");
  const obradorDer = puntos.find((p) => p.exhibidora === numero && p.lado === "obrador" && p.posicion === "derecha");
  const clienteIzq = puntos.find((p) => p.exhibidora === numero && p.lado === "cliente" && p.posicion === "izquierda");
  const clienteDer = puntos.find((p) => p.exhibidora === numero && p.lado === "cliente" && p.posicion === "derecha");

  return (
    <div className="card p-4">
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Obrador</p>
      <div className="grid grid-cols-6 gap-1.5">
        <Celda punto={obradorIzq} onTap={onTap} />
        <Celda />
        <Celda />
        <Celda />
        <Celda />
        <Celda punto={obradorDer} onTap={onTap} />
      </div>
      <div className="mt-1.5 grid grid-cols-6 gap-1.5">
        <Celda punto={clienteIzq} onTap={onTap} />
        <Celda />
        <Celda />
        <Celda />
        <Celda />
        <Celda punto={clienteDer} onTap={onTap} />
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Lado Cliente</p>
      <p className="mt-1 text-center text-[11px] font-medium text-ink">Exhibidora {numero}</p>
    </div>
  );
}

export function GrillaTemperaturas({ puntos, tempMin, tempMax }: { puntos: PuntoConEstadoHoy[]; tempMin: string; tempMax: string }) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const abierto = puntos.find((p) => p.idPunto === abiertoId) ?? null;
  const [state, formAction, pending] = useActionState(registrarTemperaturaAction, undefined);

  // Cierra el modal cuando el registro se guarda con éxito. Se ajusta el estado
  // durante el render (en vez de en un efecto) siguiendo el patrón recomendado
  // por React para "adjusting state when a prop/state changes".
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state && !state.error) setAbiertoId(null);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExhibidoraGrid numero={1} puntos={puntos} onTap={setAbiertoId} />
        <ExhibidoraGrid numero={2} puntos={puntos} onTap={setAbiertoId} />
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAbiertoId(null)}
        >
          <div className="w-full max-w-sm card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="page-eyebrow mb-1">{abierto.detalle}</p>
                <h2 className="text-base font-semibold text-ink">
                  {abierto.registradoHoy ? "Temperatura de hoy" : "Cargar temperatura"}
                </h2>
              </div>
              <button type="button" onClick={() => setAbiertoId(null)} className="text-ink-soft hover:text-ink">
                ✕
              </button>
            </div>

            {abierto.registradoHoy ? (
              <div
                className={`rounded-lg p-3 text-sm ${
                  abierto.fueraDeRangoHoy ? "bg-bad-tint text-bad" : "bg-ok-tint text-ok"
                }`}
              >
                {abierto.temperaturaHoy}°C
                {abierto.fueraDeRangoHoy ? " — fuera del rango normal" : " — dentro del rango normal"}
              </div>
            ) : (
              <form action={formAction} className="flex flex-col gap-3">
                <input type="hidden" name="idPunto" value={abierto.idPunto} />
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Temperatura (°C)
                  <input
                    name="temperatura"
                    type="number"
                    step="0.1"
                    required
                    autoFocus
                    className="rounded-md border border-border bg-surface-raised px-3 py-2"
                  />
                </label>
                <p className="text-[11px] text-ink-soft">
                  Rango normal: {tempMin}°C a {tempMax}°C
                </p>
                {state?.error && <p className="text-sm text-bad">{state.error}</p>}
                <button
                  type="submit"
                  disabled={pending}
                  className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Guardando..." : "Guardar"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

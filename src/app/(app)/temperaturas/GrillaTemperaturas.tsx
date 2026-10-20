"use client";

import { useActionState, useState } from "react";
import { registrarTemperaturaAction } from "./actions";
import type { PuntoConEstadoHoy, SaborExhibido } from "@/lib/temperaturas/queries";
import { FormularioRegistro } from "./FormularioRegistro";

function Celda({ punto, onTap }: { punto?: PuntoConEstadoHoy; onTap?: (idPunto: number) => void }) {
  if (!punto) {
    return <div className="h-12 rounded-md border border-border bg-surface" />;
  }
  return (
    <button
      type="button"
      onClick={() => onTap?.(punto.idPunto)}
      className={`relative flex h-12 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
        punto.registradoHoy
          ? punto.fueraDeRangoHoy
            ? "border-bad bg-bad-tint text-bad"
            : "border-ok bg-ok-tint text-ok"
          : "border-warn bg-warn-tint text-warn hover:border-copper"
      }`}
    >
      {punto.registradoHoy ? `${punto.temperaturaHoy}°` : "Medir"}
      {punto.analisisOkHoy === false && (
        <span
          title="Análisis No OK"
          className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-bad text-[9px] font-bold text-white"
        >
          <span aria-hidden="true">!</span>
          <span className="sr-only">Análisis No OK</span>
        </span>
      )}
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

export function GrillaTemperaturas({
  puntos,
  sabores,
  tempMin,
  tempMax,
  cerrado,
}: {
  puntos: PuntoConEstadoHoy[];
  sabores: SaborExhibido[];
  tempMin: string;
  tempMax: string;
  cerrado: boolean;
}) {
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

  const mostrarForm = abierto !== null && !cerrado;

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
          <div className="w-full max-w-sm card max-h-[calc(100dvh-2rem)] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="page-eyebrow mb-1">{abierto.detalle}</p>
                <h2 className="text-base font-semibold text-ink">
                  {mostrarForm
                    ? abierto.registradoHoy
                      ? "Editar temperatura"
                      : "Cargar temperatura"
                    : abierto.registradoHoy
                      ? "Temperatura de hoy"
                      : "Sin registrar"}
                </h2>
              </div>
              <button type="button" onClick={() => setAbiertoId(null)} className="text-ink-soft hover:text-ink">
                ✕
              </button>
            </div>

            {mostrarForm ? (
              <FormularioRegistro
                key={abierto.idPunto}
                punto={abierto}
                sabores={sabores}
                tempMin={tempMin}
                tempMax={tempMax}
                error={state?.error}
                pending={pending}
                formAction={formAction}
              />
            ) : abierto.registradoHoy ? (
              <div className="flex flex-col gap-2">
                <div
                  className={`rounded-lg p-3 text-sm ${
                    abierto.fueraDeRangoHoy ? "bg-bad-tint text-bad" : "bg-ok-tint text-ok"
                  }`}
                >
                  {abierto.temperaturaHoy}°C
                  {abierto.fueraDeRangoHoy ? " — fuera del rango normal" : " — dentro del rango normal"}
                </div>
                <div className="flex flex-col gap-0.5 text-sm text-ink">
                  <p>
                    <span className="text-ink-soft">Sabor: </span>
                    {abierto.saborHoy ?? "—"}
                  </p>
                  <p>
                    <span className="text-ink-soft">Análisis: </span>
                    {abierto.analisisOkHoy === null ? "—" : abierto.analisisOkHoy ? "OK" : "No OK"}
                  </p>
                  {abierto.analisisOkHoy === false && (
                    <p>
                      <span className="text-ink-soft">Observación: </span>
                      <span className="break-words">{abierto.observacionHoy}</span>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-surface-raised p-3 text-sm text-ink-soft">
                No se cargó este punto y el día ya está cerrado.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

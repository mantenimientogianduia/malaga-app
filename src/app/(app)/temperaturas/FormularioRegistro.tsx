"use client";

import { useState } from "react";
import type { PuntoConEstadoHoy, SaborExhibido } from "@/lib/temperaturas/queries";
import {
  PASO_TEMPERATURA,
  TEMPERATURA_INICIAL,
  ajustarTemperatura,
  parsearTemperatura,
} from "@/lib/temperaturas/stepper";

type Analisis = "ok" | "no_ok" | null;

export function FormularioRegistro({
  punto,
  sabores,
  tempMin,
  tempMax,
  error,
  pending,
  formAction,
}: {
  punto: PuntoConEstadoHoy;
  sabores: SaborExhibido[];
  tempMin: string;
  tempMax: string;
  error?: string;
  pending: boolean;
  formAction: (payload: FormData) => void;
}) {
  const [idProd, setIdProd] = useState(punto.idProdHoy !== null ? String(punto.idProdHoy) : "");
  const [temperatura, setTemperatura] = useState(punto.temperaturaHoy ?? TEMPERATURA_INICIAL.toFixed(1));
  const [analisis, setAnalisis] = useState<Analisis>(
    punto.analisisOkHoy === null ? null : punto.analisisOkHoy ? "ok" : "no_ok"
  );
  const [observacion, setObservacion] = useState(punto.observacionHoy ?? "");

  const valor = parsearTemperatura(temperatura);
  const mover = (delta: number) =>
    setTemperatura(ajustarTemperatura(valor ?? TEMPERATURA_INICIAL, delta).toFixed(1));

  const completo =
    idProd !== "" && valor !== null && analisis !== null && (analisis === "ok" || observacion.trim() !== "");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="idPunto" value={punto.idPunto} />
      <input type="hidden" name="analisis" value={analisis ?? ""} />

      <label className="flex flex-col gap-1 text-sm text-ink">
        Sabor
        <select
          name="idProd"
          required
          value={idProd}
          onChange={(e) => setIdProd(e.target.value)}
          className="rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <option value="">Elegí el sabor que medís...</option>
          {sabores.map((s) => (
            <option key={s.nroPosicion} value={s.idProd}>
              {s.nroPosicion} · {s.detalle}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm text-ink">
        Temperatura (°C)
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            aria-label={`Bajar ${PASO_TEMPERATURA} grados`}
            onClick={() => mover(-PASO_TEMPERATURA)}
            className="h-11 w-11 flex-none rounded-md border border-border text-lg font-semibold text-ink transition-colors hover:border-copper hover:text-copper"
          >
            −
          </button>
          <input
            name="temperatura"
            type="number"
            step="0.1"
            required
            value={temperatura}
            onChange={(e) => setTemperatura(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-center font-mono text-lg"
          />
          <button
            type="button"
            aria-label={`Subir ${PASO_TEMPERATURA} grados`}
            onClick={() => mover(PASO_TEMPERATURA)}
            className="h-11 w-11 flex-none rounded-md border border-border text-lg font-semibold text-ink transition-colors hover:border-copper hover:text-copper"
          >
            +
          </button>
        </div>
        <p className="text-[11px] text-ink-soft">
          Rango normal: {tempMin}°C a {tempMax}°C
        </p>
      </div>

      <div className="flex flex-col gap-1 text-sm text-ink">
        Análisis sensorial / visual
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={analisis === "ok"}
            onClick={() => setAnalisis("ok")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              analisis === "ok"
                ? "border-ok bg-ok-tint text-ok"
                : "border-border text-ink hover:border-ok hover:text-ok"
            }`}
          >
            OK
          </button>
          <button
            type="button"
            aria-pressed={analisis === "no_ok"}
            onClick={() => setAnalisis("no_ok")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              analisis === "no_ok"
                ? "border-bad bg-bad-tint text-bad"
                : "border-border text-ink hover:border-bad hover:text-bad"
            }`}
          >
            No OK
          </button>
        </div>
      </div>

      {analisis === "no_ok" && (
        <label className="flex flex-col gap-1 text-sm text-ink">
          Observación
          <textarea
            name="observacion"
            required
            rows={3}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="¿Qué observaste?"
            className="rounded-md border border-border bg-surface-raised px-3 py-2"
          />
        </label>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}

      <button
        type="submit"
        disabled={pending || !completo}
        className="self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}

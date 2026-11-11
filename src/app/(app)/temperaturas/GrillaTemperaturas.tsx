"use client";

import { useActionState, useState } from "react";
import { editarTemperaturaAction, registrarTemperaturaAction } from "./actions";
import type { MedicionHoy, PuntoConEstadoHoy, SaborExhibido } from "@/lib/temperaturas/queries";
import { formatHora } from "@/lib/formatDate";
import { FormularioRegistro } from "./FormularioRegistro";

// Qué se ve dentro del modal de un punto: la lista de mediciones de hoy, el
// formulario para agregar una nueva, o el formulario para corregir una (por id).
type Vista = "lista" | "nueva" | number;

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
      {punto.medicionesHoy > 1 && (
        <span
          title={`${punto.medicionesHoy} mediciones hoy`}
          className="absolute bottom-0.5 right-1 font-mono text-[9px] font-medium opacity-80"
        >
          ×{punto.medicionesHoy}
        </span>
      )}
      {punto.hayNoOkHoy && (
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

function ListaMediciones({
  mediciones,
  puedeEditar,
  onEditar,
}: {
  mediciones: MedicionHoy[];
  puedeEditar: boolean;
  onEditar: (idRegistro: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {mediciones.map((m) => (
        <li
          key={m.idRegistro}
          className={`rounded-lg border p-3 text-sm ${m.fueraDeRango ? "border-bad bg-bad-tint" : "border-border bg-surface-raised"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`font-mono text-base font-semibold ${m.fueraDeRango ? "text-bad" : "text-ink"}`}>
                {m.temperatura}°C
                <span className="ml-2 font-sans text-xs font-normal text-ink-soft">{formatHora(m.tsRegistro)}</span>
              </p>
              <p className="text-xs text-ink-soft">
                {m.saborDetalle ?? "—"} · análisis {m.analisisOk === null ? "—" : m.analisisOk ? "OK" : "No OK"}
              </p>
              {m.analisisOk === false && m.observacion && (
                <p className="break-words text-xs text-ink">{m.observacion}</p>
              )}
              <p className="text-[10.5px] text-ink-soft">
                {m.userRegistro ?? "—"}
                {m.tsEdicion
                  ? ` · editada ${formatHora(m.tsEdicion)}${m.userEdicion ? ` por ${m.userEdicion}` : ""}`
                  : ""}
              </p>
            </div>
            {puedeEditar && (
              <button
                type="button"
                onClick={() => onEditar(m.idRegistro)}
                className="flex-none rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors hover:border-copper hover:text-copper"
              >
                Editar
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GrillaTemperaturas({
  puntos,
  mediciones,
  sabores,
  tempMin,
  tempMax,
  cerrado,
}: {
  puntos: PuntoConEstadoHoy[];
  mediciones: MedicionHoy[];
  sabores: SaborExhibido[];
  tempMin: string;
  tempMax: string;
  cerrado: boolean;
}) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [vista, setVista] = useState<Vista>("lista");
  const abierto = puntos.find((p) => p.idPunto === abiertoId) ?? null;
  const medicionesPunto = mediciones.filter((m) => m.idPunto === abiertoId);
  const [stateNueva, formActionNueva, pendingNueva] = useActionState(registrarTemperaturaAction, undefined);
  const [stateEditar, formActionEditar, pendingEditar] = useActionState(editarTemperaturaAction, undefined);

  // Al abrir un punto: sin mediciones hoy va directo al formulario; con mediciones,
  // a la lista para poder corregir una o agregar otra.
  const abrir = (idPunto: number) => {
    const tiene = mediciones.some((m) => m.idPunto === idPunto);
    setAbiertoId(idPunto);
    setVista(tiene ? "lista" : "nueva");
  };

  // Cierra el modal cuando se guarda con éxito. Se ajusta el estado durante el
  // render (en vez de en un efecto) siguiendo el patrón recomendado por React
  // para "adjusting state when a prop/state changes".
  const [lastNueva, setLastNueva] = useState(stateNueva);
  if (stateNueva !== lastNueva) {
    setLastNueva(stateNueva);
    if (stateNueva && !stateNueva.error) setAbiertoId(null);
  }
  const [lastEditar, setLastEditar] = useState(stateEditar);
  if (stateEditar !== lastEditar) {
    setLastEditar(stateEditar);
    if (stateEditar && !stateEditar.error) setAbiertoId(null);
  }

  const enEdicion = typeof vista === "number" ? medicionesPunto.find((m) => m.idRegistro === vista) : undefined;
  const mostrarLista = !cerrado && !enEdicion && vista === "lista" && medicionesPunto.length > 0;
  const titulo =
    cerrado || mostrarLista
      ? medicionesPunto.length > 0
        ? "Mediciones de hoy"
        : "Sin registrar"
      : enEdicion
        ? "Editar medición"
        : medicionesPunto.length > 0
          ? "Nueva medición"
          : "Cargar temperatura";

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExhibidoraGrid numero={1} puntos={puntos} onTap={abrir} />
        <ExhibidoraGrid numero={2} puntos={puntos} onTap={abrir} />
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
                <h2 className="text-base font-semibold text-ink">{titulo}</h2>
              </div>
              <button type="button" onClick={() => setAbiertoId(null)} className="text-ink-soft hover:text-ink">
                ✕
              </button>
            </div>

            {cerrado ? (
              medicionesPunto.length > 0 ? (
                <ListaMediciones mediciones={medicionesPunto} puedeEditar={false} onEditar={() => {}} />
              ) : (
                <p className="rounded-lg bg-surface-raised p-3 text-sm text-ink-soft">
                  No se cargó este punto y el día ya está cerrado.
                </p>
              )
            ) : mostrarLista ? (
              <div className="flex flex-col gap-3">
                <ListaMediciones mediciones={medicionesPunto} puedeEditar onEditar={setVista} />
                <button
                  type="button"
                  onClick={() => setVista("nueva")}
                  className="min-h-11 self-start rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white"
                >
                  Nueva medición
                </button>
              </div>
            ) : enEdicion ? (
              <FormularioRegistro
                key={`editar-${enEdicion.idRegistro}`}
                punto={abierto}
                medicion={enEdicion}
                sabores={sabores}
                tempMin={tempMin}
                tempMax={tempMax}
                error={stateEditar?.error}
                pending={pendingEditar}
                formAction={formActionEditar}
              />
            ) : (
              <FormularioRegistro
                key={`nueva-${abierto.idPunto}`}
                punto={abierto}
                sabores={sabores}
                tempMin={tempMin}
                tempMax={tempMax}
                error={stateNueva?.error}
                pending={pendingNueva}
                formAction={formActionNueva}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
